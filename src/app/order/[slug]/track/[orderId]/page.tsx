import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";
import { computeSessionBill, mergeSessionItems } from "@/lib/services/table-session";
import { OrderTracker } from "@/components/customer/order-tracker";

export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;

  const order = await db.order.findFirst({
    where: { id: orderId, shop: { slug } },
    include: {
      items: true,
      shop: {
        select: {
          businessName: true,
          logoUrl: true,
          address: true,
          phone: true,
          currency: true,
          upiId: true,
          acceptCash: true,
          bankAccountNumber: true,
          bankName: true,
          bankIfsc: true,
          paymentQrImageUrl: true,
        },
      },
    },
  });
  if (!order) notFound();

  const { shop, ...orderFields } = order;
  const trackedOrder = toOrderEvent(orderFields);

  let session: ReturnType<typeof toTableSessionEvent> | null = null;
  let sessionBill: ReturnType<typeof computeSessionBill> | null = null;
  // The full accumulated item list across every round of this table session —
  // used so "Download PDF" / "Share" reflect the whole running tab, not just
  // this one WhatsApp order's items. Null for non-table orders.
  let sessionItems: ReturnType<typeof mergeSessionItems> | null = null;
  if (order.tableSessionId) {
    const [sessionRow, taxes, ordersInSession] = await Promise.all([
      db.tableSession.findUnique({ where: { id: order.tableSessionId } }),
      db.tax.findMany({ where: { shopId: order.shopId, isEnabled: true } }),
      db.order.findMany({
        where: { tableSessionId: order.tableSessionId, status: { not: "CANCELLED" } },
        include: { items: { include: { product: { select: { categoryId: true } } } } },
      }),
    ]);
    if (sessionRow) {
      const sessionOrdersForBill = ordersInSession.map((o) => ({
        status: o.status,
        items: o.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          categoryId: item.product?.categoryId,
        })),
      }));
      session = toTableSessionEvent(sessionRow);
      sessionBill = computeSessionBill(sessionOrdersForBill, taxes.map((t) => ({ ...t, value: Number(t.value) })));
      sessionItems = mergeSessionItems(sessionOrdersForBill);
    }
  }

  return (
    <OrderTracker
      order={trackedOrder}
      shop={shop}
      session={session}
      sessionBill={sessionBill}
      sessionItems={sessionItems}
    />
  );
}
