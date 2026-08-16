import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { mergeSessionItems, computeSessionBill } from "@/lib/services/table-session";
import { SessionBill } from "@/components/admin/session-bill";
import type { BillOrderData } from "@/lib/hooks/use-bill-actions";
import type { OrderStatus } from "@/lib/order-status";

// A table session isn't an Order — it has no bill/payment-status fields of
// its own (see TableSession in schema.prisma) — so this maps its
// status/paidAmount onto the closest OrderStatus/PaymentStatus a bill
// template understands, rather than adding a second, session-shaped bill
// data model per print spec §9 ("one bill data model").
function sessionStatusToOrderStatus(status: string): OrderStatus {
  if (status === "PAID" || status === "MERGED") return "COMPLETED";
  if (status === "AWAITING_PAYMENT") return "READY";
  return "PREPARING";
}

export default async function TableSessionBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const shop = await getShopById(session.shopId);

  const tableSession = await db.tableSession.findFirst({
    where: { id, shopId: session.shopId },
    include: {
      orders: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
        include: { items: { include: { product: { select: { categoryId: true } } } } },
      },
    },
  });
  if (!tableSession) notFound();

  const taxes = await db.tax.findMany({ where: { shopId: session.shopId, isEnabled: true } });
  const taxLines = taxes.map((t) => ({ ...t, value: Number(t.value) }));

  const orders = tableSession.orders.map((o) => ({
    status: o.status,
    items: o.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity,
      categoryId: item.product?.categoryId ?? "",
    })),
  }));

  const mergedItems = mergeSessionItems(orders);
  const bill = computeSessionBill(orders, taxLines);
  const paidAmount = tableSession.paidAmount != null ? Number(tableSession.paidAmount) : null;

  const billOrder: BillOrderData = {
    id: tableSession.id,
    billNumber: `TABLE-${tableSession.tableNumber}`,
    tokenNumber: null,
    customerName: tableSession.customerName,
    customerPhone: tableSession.customerPhone,
    tableNumber: tableSession.tableNumber,
    deliveryAddress: null,
    notes: null,
    subtotal: bill.subtotal,
    taxTotal: bill.taxTotal,
    grandTotal: bill.grandTotal,
    taxBreakdown: bill.taxLines,
    status: sessionStatusToOrderStatus(tableSession.status),
    paymentMethod: tableSession.paymentMethod,
    paymentStatus: tableSession.status === "PAID" ? "PAID" : paidAmount && paidAmount > 0 ? "PARTIALLY_PAID" : "PENDING",
    paidAmount,
    transactionReference: null,
    cancelReason: null,
    cancelledAt: null,
    discountType: null,
    discountValue: null,
    discountReason: null,
    discountedTotal: null,
    createdAt: tableSession.createdAt.toISOString(),
    items: mergedItems.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
    })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;

  return (
    <SessionBill
      format={shop.printFormat}
      order={billOrder}
      shop={{
        slug: shop.slug,
        businessName: shop.businessName,
        logoUrl: shop.logoUrl,
        address: shop.address,
        phone: shop.phone,
        whatsappNumber: shop.whatsappNumber,
        gstNumber: shop.gstNumber,
        currency: shop.currency,
        upiId: shop.upiId,
        acceptCash: shop.acceptCash,
        bankAccountNumber: shop.bankAccountNumber,
        bankName: shop.bankName,
        bankIfsc: shop.bankIfsc,
        paymentQrImageUrl: shop.paymentQrImageUrl,
        paymentDisplayName: (shopAny.paymentDisplayName as string | null) ?? null,
        enableTableNumber: (shopAny.enableTableNumber as boolean) ?? true,
        enableOrderBarcodeLabels: (shopAny.enableOrderBarcodeLabels as boolean) ?? false,
        printFormat: shop.printFormat,
      }}
    />
  );
}
