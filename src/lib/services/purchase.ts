/**
 * Supplier stock-in ("Purchase") — see Purchase/PurchaseItem doc comments in
 * prisma/schema.prisma. Creating one increments Product.stock per line;
 * cancelling reverses it (clamped at 0, same convention as loss-damage.ts,
 * since stock received may have already partially sold through by then).
 */
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { caseInsensitive } from "@/lib/db-provider";
import type { PartyPaymentMethod, PurchaseStatus, PaymentStatus } from "@/generated/prisma/enums";
import { NotFoundError, PurchaseError } from "@/lib/api-utils";
import { round2 } from "@/lib/services/billing";
import { recomputePaymentStatus } from "@/lib/services/order-payment-status";
import { nextPurchaseNumber } from "@/lib/services/purchase-number";
import { incrementStock, reverseStockIncrement } from "@/lib/services/stock";
import type { PurchaseInput, RecordPurchasePaymentInput } from "@/lib/validation/purchase";

const PURCHASE_DETAIL_INCLUDE = {
  supplier: { select: { id: true, name: true, phone: true, type: true, gstNumber: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  partyPayments: { orderBy: { createdAt: "desc" } as const },
} satisfies Prisma.PurchaseInclude;

export type PurchaseDetail = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_DETAIL_INCLUDE }>;

// Bridges Order.paymentMethod's broader free-string vocabulary (see
// PAYMENT_METHODS in order-status.ts) to the narrower PartyPaymentMethod
// enum khatabook payments use — deliberate, documented bridging of the two
// known-inconsistent method vocabularies, not an attempt to unify them.
function toPartyPaymentMethod(method: string | undefined): PartyPaymentMethod {
  if (!method) return "CASH";
  const upper = method.toUpperCase();
  if (upper === "UPI" || upper === "GPAY" || upper === "PHONEPE" || upper === "ONLINE") return "UPI";
  if (upper === "CARD" || upper === "DEBIT_CARD" || upper === "CREDIT_CARD") return "CARD";
  if (upper === "BANK_TRANSFER" || upper === "BANK") return "BANK_TRANSFER";
  if (upper === "CASH" || upper === "COD") return "CASH";
  return "OTHER";
}

function computeLineTotal(item: { quantity: number; purchasePrice: number; taxAmount?: number }): number {
  return round2(item.quantity * item.purchasePrice + (item.taxAmount ?? 0));
}

export async function createPurchase(shopId: string, createdBy: string | null, input: PurchaseInput): Promise<PurchaseDetail> {
  if (input.clientRequestId) {
    const existing = await db.purchase.findFirst({
      where: { shopId, clientRequestId: input.clientRequestId },
      include: PURCHASE_DETAIL_INCLUDE,
    });
    if (existing) return existing;
  }

  const supplier = await db.party.findFirst({ where: { id: input.supplierId, shopId } });
  if (!supplier) throw new NotFoundError("Supplier not found");
  if (supplier.type !== "SUPPLIER") throw new PurchaseError("Selected party is not a supplier");

  const productIds = input.items.map((i) => i.productId);
  const products = await db.product.findMany({ where: { id: { in: productIds }, shopId } });
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const item of input.items) {
    if (!productById.has(item.productId)) throw new NotFoundError("One or more products were not found");
  }

  const subtotal = round2(input.items.reduce((sum, i) => sum + i.quantity * i.purchasePrice, 0));
  const taxTotal = round2(input.items.reduce((sum, i) => sum + (i.taxAmount ?? 0), 0));
  const discountAmount = input.discountAmount ? round2(input.discountAmount) : null;
  const grandTotal = round2(subtotal + taxTotal - (discountAmount ?? 0));

  const paidAmount = input.paidAmount ? round2(input.paidAmount) : null;
  if (paidAmount != null && paidAmount > grandTotal + 0.005) {
    throw new PurchaseError("Paid amount cannot exceed the purchase total");
  }
  const paymentStatus = paidAmount ? recomputePaymentStatus("PENDING", paidAmount, grandTotal) : "PENDING";
  const updateCostPrice = input.updateCostPrice ?? true;

  try {
    return await db.$transaction(async (tx) => {
      const purchaseNumber = await nextPurchaseNumber(tx, shopId);

      const purchase = await tx.purchase.create({
        data: {
          shopId,
          purchaseNumber,
          purchaseDate: new Date(input.purchaseDate),
          supplierId: supplier.id,
          supplierName: supplier.name,
          supplierGstNumber: supplier.gstNumber,
          invoiceNumber: input.invoiceNumber || null,
          subtotal,
          taxTotal,
          discountAmount,
          grandTotal,
          paidAmount,
          paymentStatus,
          paymentMethod: input.paymentMethod ?? null,
          notes: input.notes || null,
          clientRequestId: input.clientRequestId ?? null,
          createdBy,
          items: {
            create: input.items.map((item) => {
              const product = productById.get(item.productId)!;
              return {
                productId: product.id,
                productName: product.name,
                quantity: item.quantity,
                purchasePrice: item.purchasePrice,
                taxAmount: item.taxAmount ?? null,
                lineTotal: computeLineTotal(item),
                batchNumber: item.batchNumber || null,
                expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
              };
            }),
          },
        },
      });

      await incrementStock(tx, input.items.map((item) => ({ productId: item.productId, quantity: item.quantity })));
      if (updateCostPrice) {
        for (const item of input.items) {
          await tx.product.update({ where: { id: item.productId }, data: { costPrice: item.purchasePrice } });
        }
      }

      if (paidAmount && paidAmount > 0) {
        await tx.partyPayment.create({
          data: {
            shopId,
            partyId: supplier.id,
            purchaseId: purchase.id,
            amount: paidAmount,
            method: toPartyPaymentMethod(input.paymentMethod),
            direction: "PAID",
            note: `Payment for purchase ${purchaseNumber}`,
            createdBy: createdBy ?? "system",
          },
        });
      }

      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: PURCHASE_DETAIL_INCLUDE });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && input.clientRequestId) {
      const winner = await db.purchase.findFirst({
        where: { shopId, clientRequestId: input.clientRequestId },
        include: PURCHASE_DETAIL_INCLUDE,
      });
      if (winner) return winner;
    }
    throw error;
  }
}

export async function recordPurchasePayment(
  shopId: string,
  purchaseId: string,
  createdBy: string | null,
  input: RecordPurchasePaymentInput
): Promise<PurchaseDetail> {
  const purchase = await db.purchase.findFirst({ where: { id: purchaseId, shopId } });
  if (!purchase) throw new NotFoundError("Purchase not found");
  if (purchase.status === "CANCELLED") throw new PurchaseError("Cannot record a payment against a cancelled purchase");

  const currentPaid = Number(purchase.paidAmount ?? 0);
  const grandTotal = Number(purchase.grandTotal);
  const newPaid = round2(currentPaid + input.amount);
  if (newPaid > grandTotal + 0.005) {
    throw new PurchaseError(`Payment (${input.amount.toFixed(2)}) would exceed the outstanding amount for this purchase`);
  }

  await db.$transaction(async (tx) => {
    await tx.partyPayment.create({
      data: {
        shopId,
        partyId: purchase.supplierId,
        purchaseId: purchase.id,
        amount: input.amount,
        method: input.method,
        direction: "PAID",
        note: input.note || `Payment for purchase ${purchase.purchaseNumber}`,
        createdBy: createdBy ?? "system",
      },
    });
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { paidAmount: newPaid, paymentStatus: recomputePaymentStatus(purchase.paymentStatus, newPaid, grandTotal) },
    });
  });

  return db.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: PURCHASE_DETAIL_INCLUDE });
}

export async function cancelPurchase(shopId: string, purchaseId: string, cancelledBy: string | null, reason?: string): Promise<PurchaseDetail> {
  const purchase = await db.purchase.findFirst({ where: { id: purchaseId, shopId }, include: { items: true } });
  if (!purchase) throw new NotFoundError("Purchase not found");
  if (purchase.status === "CANCELLED") throw new PurchaseError("Purchase is already cancelled");

  await db.$transaction(async (tx) => {
    await reverseStockIncrement(tx, purchase.items.map((item) => ({ productId: item.productId, quantity: item.quantity })));
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: "CANCELLED", cancelReason: reason || null, cancelledAt: new Date(), cancelledBy },
    });
  });

  return db.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: PURCHASE_DETAIL_INCLUDE });
}

export interface PurchaseListFilters {
  search?: string;
  supplierId?: string;
  status?: string;
  paymentStatus?: string;
  from?: Date;
  to?: Date;
}

export async function listPurchases(shopId: string, filters: PurchaseListFilters = {}, page = 1, pageSize = 25) {
  const where: Prisma.PurchaseWhereInput = {
    shopId,
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.status ? { status: filters.status as PurchaseStatus } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus as PaymentStatus } : {}),
    ...(filters.from || filters.to ? { purchaseDate: { gte: filters.from, lte: filters.to } } : {}),
    ...(filters.search
      ? {
          OR: [
            { purchaseNumber: { contains: filters.search, ...caseInsensitive() } },
            { supplierName: { contains: filters.search, ...caseInsensitive() } },
            { invoiceNumber: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };

  const [total, purchases] = await Promise.all([
    db.purchase.count({ where }),
    db.purchase.findMany({
      where,
      orderBy: { purchaseDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { supplier: { select: { id: true, name: true, phone: true } }, items: { select: { id: true } } },
    }),
  ]);

  return { purchases, total, page, pageSize };
}

export async function getPurchaseDetail(shopId: string, id: string): Promise<PurchaseDetail> {
  const purchase = await db.purchase.findFirst({ where: { id, shopId }, include: PURCHASE_DETAIL_INCLUDE });
  if (!purchase) throw new NotFoundError("Purchase not found");
  return purchase;
}

export async function listSuppliersForPicker(shopId: string) {
  return db.party.findMany({
    where: { shopId, type: "SUPPLIER" },
    select: { id: true, name: true, phone: true, gstNumber: true },
    orderBy: { name: "asc" },
  });
}
