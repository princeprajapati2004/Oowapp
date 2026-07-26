import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { publishOrderEvent, toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_paid"),
    paymentMethod: z.enum(["CASH", "UPI", "CARD", "OTHER", "VOID"]),
    paymentNote: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("request_bill") }),
]);

// Ticket statuses that get swept to COMPLETED once the table is marked
// paid — cancelled tickets are left alone.
const OPEN_TICKET_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = patchSchema.parse(body);

    const tableSession = await db.tableSession.findFirst({ where: { id, shopId: session.shopId } });
    if (!tableSession) throw new NotFoundError("Table session not found");

    if (input.action === "request_bill") {
      if (tableSession.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Bill has already been requested for this table." },
          { status: 409 }
        );
      }
      const updated = await db.tableSession.update({
        where: { id },
        data: { status: "AWAITING_PAYMENT", billRequestedAt: new Date() },
      });
      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updated) });
      return NextResponse.json({ ok: true, session: toTableSessionEvent(updated) });
    }

    // action === "mark_paid"
    if (tableSession.status === "PAID") {
      return NextResponse.json({ error: "This table has already been paid." }, { status: 409 });
    }

    const [updatedSession, completedOrders] = await db.$transaction(async (tx) => {
      const updated = await tx.tableSession.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paidBy: session.adminId,
          paymentMethod: input.paymentMethod,
          paymentNote: input.paymentNote ?? null,
        },
      });

      const openOrders = await tx.order.findMany({
        where: { tableSessionId: id, status: { in: [...OPEN_TICKET_STATUSES] } },
        include: { items: true },
      });

      const orders = await Promise.all(
        openOrders.map((o) =>
          tx.order.update({ where: { id: o.id }, data: { status: "COMPLETED" }, include: { items: true } })
        )
      );

      return [updated, orders] as const;
    });

    publishOrderEvent(session.shopId, {
      type: "session.updated",
      session: toTableSessionEvent(updatedSession),
    });
    for (const order of completedOrders) {
      publishOrderEvent(session.shopId, { type: "order.updated", order: toOrderEvent(order) });
    }

    return NextResponse.json({ ok: true, session: toTableSessionEvent(updatedSession) });
  } catch (error) {
    return handleApiError(error);
  }
}
