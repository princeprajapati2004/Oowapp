import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";
import { computeSessionBill, mergeSessionItems } from "@/lib/services/table-session";
import { OrderTracker } from "@/components/customer/order-tracker";
import { getCustomerSession } from "@/lib/customer-session";
import { RETURN_DETAIL_INCLUDE, toCustomerReturnDetailPayload } from "@/lib/services/return-request";
import { computeOrderReturnBadge, computeOrderTotalRefunded } from "@/lib/services/return-eligibility";

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
          paymentDisplayName: true,
          googlePayUpi: true,
          phonePeUpi: true,
          paytmUpi: true,
          bhimUpi: true,
        },
      },
    },
  });
  if (!order) notFound();

  // Guest orders (no customerId) keep the unguessable-id-as-access-token
  // model this page has always used. An order placed by a logged-in account,
  // though, must only be viewable by that same account — otherwise any
  // customer who learns another customer's order id/link could see their
  // name, phone, and address here.
  if (order.customerId) {
    const session = await getCustomerSession();
    if (!session || session.customerId !== order.customerId || session.shopId !== order.shopId) {
      notFound();
    }
  }

  const { shop, ...orderFields } = order;
  const trackedOrder = toOrderEvent(orderFields);

  const returnRequests = await db.returnRequest.findMany({
    where: { orderId: order.id, shopId: order.shopId },
    orderBy: { createdAt: "desc" },
    include: RETURN_DETAIL_INCLUDE,
  });
  // Already have the full return list from the query above — derive these
  // two display fields from it directly rather than adding a redundant
  // returnRequests include to the order query itself (order-search.ts and
  // /api/customer/orders do that instead, since they don't otherwise fetch
  // full return detail).
  trackedOrder.returnBadge = computeOrderReturnBadge(
    order.items.map((i) => ({ quantity: i.quantity })),
    returnRequests.map((r) => ({ status: r.status, items: r.items }))
  );
  trackedOrder.totalRefunded = computeOrderTotalRefunded(
    returnRequests.map((r) => ({ status: r.status, requestedRefundAmount: Number(r.requestedRefundAmount) }))
  );

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
      returns={returnRequests.map(toCustomerReturnDetailPayload)}
    />
  );
}
