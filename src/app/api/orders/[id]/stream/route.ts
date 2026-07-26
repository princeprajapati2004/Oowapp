import { db } from "@/lib/db";
import { createOrderEventStream } from "@/lib/server/order-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const order = await db.order.findUnique({ where: { id }, select: { shopId: true } });
  if (!order) {
    return new Response("Not found", { status: 404 });
  }

  // Public route (no session) — the shop channel carries every customer's
  // orders, so this must only ever forward events for this specific order.
  return createOrderEventStream(
    request,
    order.shopId,
    (event) => (event.type === "order.created" || event.type === "order.updated") && event.order.id === id
  );
}
