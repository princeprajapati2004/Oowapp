import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { calculateBill } from "@/lib/services/billing";
import { resolveOrCreateSession, OPEN_STATUSES } from "@/lib/services/table-session";
import { nextBillNumber } from "@/lib/services/bill-number";
import { sendNewOrderNotification } from "@/lib/services/push";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import { createNotification } from "@/lib/services/notification";
import { formatCurrency } from "@/lib/utils/currency";
import { searchOrders, type OrderSourceFilter, type OrderTypeFilter } from "@/lib/services/order-search";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { findOrCreatePartyForOrder } from "@/lib/services/party";
import type { Prisma } from "@/generated/prisma/client";

// GET — the owner order management list (brief §2/§12–§18): server-side
// search/status/payment/type/date filtering with keyset pagination, scoped
// to the caller's shop only. Reuses searchOrders so the orders RSC page's
// initial load and this endpoint never drift from each other.
export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const url = new URL(request.url);
    const params = url.searchParams;

    const result = await searchOrders(session.shopId, {
      search: params.get("search") ?? undefined,
      status: params.get("status") ?? undefined,
      paymentStatus: params.get("paymentStatus") ?? undefined,
      type: (params.get("type") as OrderTypeFilter | null) ?? undefined,
      source: (params.get("source") as OrderSourceFilter | null) ?? undefined,
      dateFrom: params.get("dateFrom") ?? undefined,
      dateTo: params.get("dateTo") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
      pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

const orderItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1),
  price: z.number().min(0),
  quantity: z.number().int().positive(),
  categoryId: z.string().default(""),
});

const createManualOrderSchema = z.object({
  customerName: z.string().trim().max(100).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  tableNumber: z.string().trim().max(50).optional(),
  deliveryAddress: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["CASH", "UPI", "CARD", "ONLINE", "WALLET", "SPLIT", "PENDING"]).default("CASH"),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.number().positive().max(100_000).optional(),
  discountReason: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = createManualOrderSchema.parse(body);

    const shop = await db.shop.findUnique({
      where: { id: session.shopId },
      include: { taxes: { where: { isEnabled: true } } },
    });
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    // A table number here only opens a running-tab TableSession (see below)
    // when payment is Pending — that's the only case an unrecognized table
    // number could stand up a session nothing can ever find on the board.
    // Fully-settled dine-in orders (Cash/UPI/etc.) keep accepting freeform
    // table text exactly as before, unaffected.
    if (input.tableNumber && input.paymentMethod === "PENDING") {
      const configuredTables: string[] = shop.tableNames ? JSON.parse(shop.tableNames) : [];
      if (configuredTables.length > 0 && !configuredTables.includes(input.tableNumber)) {
        return NextResponse.json(
          { error: "This table wasn't recognized. Please select a valid table." },
          { status: 400 }
        );
      }
    }

    // A non-Pending order never joins a table's running session (see
    // resolveOrCreateSession below) — so if this table already has one open,
    // block it here rather than silently creating a second, disconnected
    // bill for what's really the same customer visit.
    if (input.tableNumber && input.paymentMethod !== "PENDING") {
      const openSession = await db.tableSession.findFirst({
        where: { shopId: shop.id, tableNumber: input.tableNumber, status: { in: [...OPEN_STATUSES] } },
      });
      if (openSession) {
        return NextResponse.json(
          { error: "This table already has an open order — use Pending to add to it instead of starting a separate bill." },
          { status: 409 }
        );
      }
    }

    const billItems = input.items.map((item) => ({
      id: item.productId ?? crypto.randomUUID(),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      categoryId: item.categoryId,
    }));

    const bill = calculateBill(
      billItems,
      shop.taxes.map((t) => ({ ...t, value: Number(t.value) }))
    );

    // Frozen onto each OrderItem.costPrice below — see profit.ts's doc
    // comment on why this can't be looked up live from Product later.
    // Free-text items (no productId, e.g. a one-off manual line) have none.
    const productIdsWithCost = input.items.map((i) => i.productId).filter((id): id is string => !!id);
    const costPriceById = new Map(
      productIdsWithCost.length > 0
        ? (
            await db.product.findMany({
              where: { id: { in: productIdsWithCost }, shopId: shop.id },
              select: { id: true, costPrice: true },
            })
          ).map((p) => [p.id, p.costPrice != null ? Number(p.costPrice) : null])
        : []
    );

    // Per-shop-per-day sequential display number for admin-created orders
    // only (see prisma schema comment on Order.tokenNumber) — separate from
    // billNumber (now an atomic per-shop sequence, see nextBillNumber), this
    // one is still a non-atomic count() since it's a cosmetic display number,
    // not the uniqueness-bearing identifier.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const tokenNumber =
      (await db.order.count({ where: { shopId: shop.id, createdAt: { gte: startOfToday } } })) + 1;

    let discountedTotal: number | null = null;
    if (input.discountType && input.discountValue) {
      const base = bill.grandTotal;
      const discount =
        input.discountType === "PERCENTAGE"
          ? (base * input.discountValue) / 100
          : input.discountValue;
      discountedTotal = Math.max(0, base - discount);
    }

    const order = await db.$transaction(async (tx) => {
      // Only a Pending-payment dine-in order represents a running tab —
      // everything else (Cash/UPI/etc.) is an immediately-settled sale and
      // never touches table occupancy, exactly like before this change.
      const tableSession =
        input.tableNumber && input.paymentMethod === "PENDING"
          ? await resolveOrCreateSession(tx, {
              shopId: shop.id,
              tableNumber: input.tableNumber,
              customerName: input.customerName,
              customerPhone: input.customerPhone,
              customerId: null,
            })
          : null;

      const billNumber = await nextBillNumber(tx, shop.id);

      // Every order (guest or logged-in) rolls up into the owner's Parties
      // khatabook — find-or-create by phone, same as the customer-facing
      // order route (see findOrCreatePartyForOrder's own doc comment).
      const partyId = await findOrCreatePartyForOrder(tx, shop.id, input.customerName, input.customerPhone);

      // Decrement stock for products that track it (stock === null means untracked)
      const itemsWithProduct = input.items.filter((i) => i.productId);
      if (itemsWithProduct.length > 0) {
        await Promise.all(
          itemsWithProduct.map((i) =>
            tx.product.updateMany({
              where: { id: i.productId!, shopId: shop.id, stock: { gt: 0 } },
              data: { stock: { decrement: i.quantity } },
            })
          )
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (tx.order as any).create({
        data: {
          shopId: shop.id,
          billNumber,
          tokenNumber,
          partyId,
          customerName: input.customerName || null,
          customerPhone: input.customerPhone || null,
          tableNumber: input.tableNumber || null,
          tableSessionId: tableSession?.id ?? null,
          deliveryAddress: input.deliveryAddress || null,
          notes: input.notes || null,
          subtotal: bill.subtotal,
          taxTotal: bill.taxTotal,
          grandTotal: bill.grandTotal,
          taxBreakdown: bill.taxLines as unknown as Prisma.InputJsonValue,
          paymentMethod: input.paymentMethod,
          source: "manual",
          discountType: input.discountType ?? null,
          discountValue: input.discountValue ?? null,
          discountReason: input.discountReason ?? null,
          discountedTotal,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId ?? null,
              name: item.name,
              price: item.price,
              costPrice: item.productId ? (costPriceById.get(item.productId) ?? null) : null,
              quantity: item.quantity,
              lineTotal: item.price * item.quantity,
            })),
          },
        },
        include: { items: true },
      });
    });

    sendNewOrderNotification(shop.id, {
      billNumber: order.billNumber,
      customerName: input.customerName,
      grandTotal: bill.grandTotal,
      currency: shop.currency,
      orderId: order.id,
    }).catch(() => {});

    createNotification(shop.id, {
      type: "NEW_ORDER",
      title: input.tableNumber ? `New order — Table ${input.tableNumber}` : `New order — ${order.billNumber}`,
      body: `${formatCurrency(bill.grandTotal, shop.currency)} · ${input.items.length} item${input.items.length === 1 ? "" : "s"}`,
      link: `/admin/orders/${order.id}`,
    }).catch(() => {});

    publishOrderEvent(shop.id, { type: "order.created", order: toOrderEvent(order) });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "ORDER_CREATED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "order",
      targetId: order.id,
      shopId: shop.id,
      metadata: { billNumber: order.billNumber, source: "manual", grandTotal: bill.grandTotal, paymentMethod: input.paymentMethod },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(
      { ok: true, orderId: order.id, billNumber: order.billNumber, tokenNumber: order.tokenNumber },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
