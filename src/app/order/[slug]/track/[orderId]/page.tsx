import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toOrderEvent } from "@/lib/server/order-events";
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

  return <OrderTracker order={trackedOrder} shop={shop} />;
}
