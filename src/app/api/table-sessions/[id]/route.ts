import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeSessionBill } from "@/lib/services/table-session";
import { sendBillRequestNotification } from "@/lib/services/push";
import { publishOrderEvent, toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request_bill") }),
  // No admin session required — same public-by-unguessable-id trust model as
  // the rest of this route. The customer self-reports having paid (by cash,
  // UPI, or any other means); there is no payment gateway integration behind
  // this, so `paymentNote` always records that it was self-reported rather
  // than staff-confirmed, keeping an honest audit trail for the owner.
  z.object({
    action: z.literal("customer_confirm_paid"),
    paymentMethod: z.enum(["CASH", "UPI", "OTHER"]).default("OTHER"),
  }),
]);

const OPEN_TICKET_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY"] as const;

async function loadSession(id: string) {
  const session = await db.tableSession.findUnique({ where: { id } });
  if (!session) throw new NotFoundError("Table session not found");
  return session;
}

async function loadSessionOrders(sessionId: string) {
  return db.order.findMany({
    where: { tableSessionId: sessionId, status: { not: "CANCELLED" } },
    include: { items: { include: { product: { select: { categoryId: true } } } } },
  });
}

function toBillItems(orders: Awaited<ReturnType<typeof loadSessionOrders>>) {
  return orders.map((o) => ({
    status: o.status,
    items: o.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      categoryId: item.product?.categoryId,
    })),
  }));
}

// Public lookup by unguessable cuid — same trust model as GET /api/orders/[id].
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await loadSession(id);
    const orders = await loadSessionOrders(id);
    const shop = await db.shop.findUnique({
      where: { id: session.shopId },
      include: { taxes: { where: { isEnabled: true } } },
    });
    const taxes = (shop?.taxes ?? []).map((t) => ({ ...t, value: Number(t.value) }));

    return NextResponse.json({
      session: toTableSessionEvent(session),
      orders: orders.map(toOrderEvent),
      bill: computeSessionBill(toBillItems(orders), taxes),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`table-sessions:${ip}`, 20, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const body = await request.json();
    const input = patchSchema.parse(body);

    const session = await loadSession(id);

    if (input.action === "request_bill") {
      if (session.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Bill has already been requested for this table." },
          { status: 409 }
        );
      }

      const updated = await db.tableSession.update({
        where: { id },
        data: { status: "AWAITING_PAYMENT", billRequestedAt: new Date() },
      });

      sendBillRequestNotification(session.shopId, { tableNumber: session.tableNumber, sessionId: id }).catch(
        () => {}
      );
      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updated) });

      return NextResponse.json({ ok: true, session: toTableSessionEvent(updated) });
    }

    // action === "customer_confirm_paid"
    if (session.status === "PAID") {
      return NextResponse.json({ error: "This table has already been marked as paid." }, { status: 409 });
    }

    const [updatedSession, completedOrders] = await db.$transaction(async (tx) => {
      const updated = await tx.tableSession.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paidBy: null,
          paymentMethod: input.paymentMethod,
          paymentNote: "Confirmed by customer (self-reported, not staff-verified)",
        },
      });

      const openOrders = await tx.order.findMany({
        where: { tableSessionId: id, status: { in: [...OPEN_TICKET_STATUSES] } },
        include: { items: true },
      });
      const orders = await Promise.all(
        openOrders.map((o) => tx.order.update({ where: { id: o.id }, data: { status: "COMPLETED" }, include: { items: true } }))
      );

      return [updated, orders] as const;
    });

    publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updatedSession) });
    for (const order of completedOrders) {
      publishOrderEvent(session.shopId, { type: "order.updated", order: toOrderEvent(order) });
    }

    return NextResponse.json({ ok: true, session: toTableSessionEvent(updatedSession) });
  } catch (error) {
    return handleApiError(error);
  }
}
