import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";
import { computeSessionBill } from "@/lib/services/table-session";
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
      shop: { select: { businessName: true, logoUrl: true, address: true, phone: true, currency: true } },
    },
  });
  if (!order) notFound();

  const { shop, ...orderFields } = order;
  const trackedOrder = toOrderEvent(orderFields);

  let session: ReturnType<typeof toTableSessionEvent> | null = null;
  let sessionBill: ReturnType<typeof computeSessionBill> | null = null;
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
      session = toTableSessionEvent(sessionRow);
      sessionBill = computeSessionBill(
        ordersInSession.map((o) => ({
          status: o.status,
          items: o.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            categoryId: item.product?.categoryId,
          })),
        })),
        taxes.map((t) => ({ ...t, value: Number(t.value) }))
      );
    }
  }

  return <OrderTracker order={trackedOrder} shop={shop} session={session} sessionBill={sessionBill} />;
}
