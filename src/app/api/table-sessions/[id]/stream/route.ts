import { db } from "@/lib/db";
import { createOrderEventStream } from "@/lib/server/order-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// See src/app/api/admin/orders/stream/route.ts for why this is explicit.
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await db.tableSession.findUnique({ where: { id }, select: { shopId: true } });
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  // Public route (no auth) — the shop channel carries every table's events,
  // so this must only ever forward events for this specific session (either
  // a session.* event about it, or an order.* event for one of its orders).
  // notification.* events are admin-only (owner-facing titles/links into
  // /admin/...) and must never reach an anonymous customer stream.
  return createOrderEventStream(request, session.shopId, (event) => {
    if (event.type === "session.created" || event.type === "session.updated") {
      return event.session.id === id;
    }
    if (event.type === "notification.created") {
      return false;
    }
    if (event.type === "kot.created" || event.type === "kot.updated") {
      return event.kot.tableSessionId === id;
    }
    return event.order.tableSessionId === id;
  });
}
