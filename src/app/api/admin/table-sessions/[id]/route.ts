import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/services/notification";
import { publishOrderEvent, toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";
import { OPEN_STATUSES } from "@/lib/services/table-session";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_paid"),
    // QR = customer scanned restaurant's payment QR; UPI = UPI deep link; VOID = release without payment
    paymentMethod: z.enum(["CASH", "UPI", "QR", "CARD", "WALLET", "SPLIT", "OTHER"]),
    paymentNote: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("request_bill") }),
  z.object({
    action: z.literal("release_table"),
    paymentNote: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("reject_payment") }),
  z.object({
    action: z.literal("transfer_table"),
    newTableNumber: z.string().trim().min(1).max(50),
  }),
  z.object({
    action: z.literal("merge_into"),
    targetTableNumber: z.string().trim().min(1).max(50),
  }),
  z.object({
    action: z.literal("set_guest_count"),
    guestCount: z.number().int().min(0).max(100).nullable(),
  }),
]);

// Ticket statuses swept to COMPLETED when the table is closed.
const OPEN_TICKET_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;

    const tableSession = await db.tableSession.findFirst({
      where: { id, shopId: session.shopId },
      include: {
        orders: {
          orderBy: { createdAt: "asc" },
          include: { items: true },
        },
      },
    });
    if (!tableSession) throw new NotFoundError("Table session not found");

    // Serialize Decimal fields to numbers so the client receives plain JSON numbers.
    return NextResponse.json({
      ...tableSession,
      createdAt: tableSession.createdAt.toISOString(),
      updatedAt: tableSession.updatedAt.toISOString(),
      billRequestedAt: tableSession.billRequestedAt?.toISOString() ?? null,
      paidAt: tableSession.paidAt?.toISOString() ?? null,
      orders: tableSession.orders.map((o) => ({
        ...o,
        subtotal: Number(o.subtotal),
        taxTotal: Number(o.taxTotal),
        grandTotal: Number(o.grandTotal),
        discountValue: o.discountValue ? Number(o.discountValue) : null,
        discountedTotal: o.discountedTotal ? Number(o.discountedTotal) : null,
        createdAt: o.createdAt.toISOString(),
        items: o.items.map((item) => ({
          ...item,
          price: Number(item.price),
          lineTotal: Number(item.lineTotal),
        })),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

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

    // Staff looked at the customer's claimed cash/UPI payment and it didn't
    // check out (no cash handed over, UPI never landed) — kick the table
    // back to ACTIVE so they can keep ordering or re-request the bill, rather
    // than voiding/closing it out like release_table does.
    if (input.action === "reject_payment") {
      if (tableSession.status !== "AWAITING_PAYMENT") {
        return NextResponse.json(
          { error: "This table isn't awaiting payment." },
          { status: 409 }
        );
      }
      const updated = await db.tableSession.update({
        where: { id },
        data: { status: "ACTIVE", billRequestedAt: null },
      });
      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updated) });
      return NextResponse.json({ ok: true, session: toTableSessionEvent(updated) });
    }

    if (input.action === "set_guest_count") {
      const updated = await db.tableSession.update({ where: { id }, data: { guestCount: input.guestCount } });
      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updated) });
      return NextResponse.json({ ok: true, session: toTableSessionEvent(updated) });
    }

    // release_table — same as mark_paid with VOID, labelled separately for UX
    if (input.action === "release_table") {
      if (tableSession.status === "PAID") {
        return NextResponse.json({ error: "This table has already been released." }, { status: 409 });
      }
      return closeTable(id, "VOID", input.paymentNote, session.shopId, session.adminId);
    }

    if (input.action === "transfer_table") {
      if (tableSession.status === "PAID" || tableSession.status === "MERGED") {
        return NextResponse.json({ error: "This table has no open order to transfer." }, { status: 409 });
      }
      if (input.newTableNumber === tableSession.tableNumber) {
        return NextResponse.json({ error: "That's already this table." }, { status: 400 });
      }
      const clash = await db.tableSession.findFirst({
        where: { shopId: session.shopId, tableNumber: input.newTableNumber, status: { in: [...OPEN_STATUSES] } },
      });
      if (clash) {
        return NextResponse.json(
          { error: `Table ${input.newTableNumber} already has an open order.` },
          { status: 409 }
        );
      }

      const [updatedSession, movedOrders] = await db.$transaction(async (tx) => {
        const updated = await tx.tableSession.update({
          where: { id },
          data: { tableNumber: input.newTableNumber },
        });
        await tx.order.updateMany({ where: { tableSessionId: id }, data: { tableNumber: input.newTableNumber } });
        const orders = await tx.order.findMany({ where: { tableSessionId: id }, include: { items: true } });
        return [updated, orders] as const;
      });

      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updatedSession) });
      for (const order of movedOrders) {
        publishOrderEvent(session.shopId, { type: "order.updated", order: toOrderEvent(order) });
      }
      return NextResponse.json({ ok: true, session: toTableSessionEvent(updatedSession) });
    }

    if (input.action === "merge_into") {
      if (tableSession.status === "PAID" || tableSession.status === "MERGED") {
        return NextResponse.json({ error: "This table has no open order to merge." }, { status: 409 });
      }
      if (input.targetTableNumber === tableSession.tableNumber) {
        return NextResponse.json({ error: "Can't merge a table into itself." }, { status: 400 });
      }
      const targetSession = await db.tableSession.findFirst({
        where: { shopId: session.shopId, tableNumber: input.targetTableNumber, status: { in: [...OPEN_STATUSES] } },
      });
      if (!targetSession) {
        return NextResponse.json(
          { error: `Table ${input.targetTableNumber} doesn't have an open order to merge into.` },
          { status: 409 }
        );
      }

      const [mergedSourceSession, updatedTargetSession, movedOrders] = await db.$transaction(async (tx) => {
        // Reassign every order on the source table to the target's session —
        // this is what actually combines the two tables into one bill.
        await tx.order.updateMany({
          where: { tableSessionId: id },
          data: { tableSessionId: targetSession.id, tableNumber: targetSession.tableNumber },
        });
        const source = await tx.tableSession.update({ where: { id }, data: { status: "MERGED" } });
        // Bump updatedAt on the target so board consumers relying on it as a
        // change signal (rather than just the order events) also notice.
        const target = await tx.tableSession.update({ where: { id: targetSession.id }, data: {} });
        const orders = await tx.order.findMany({ where: { tableSessionId: targetSession.id }, include: { items: true } });
        return [source, target, orders] as const;
      });

      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(mergedSourceSession) });
      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updatedTargetSession) });
      for (const order of movedOrders) {
        publishOrderEvent(session.shopId, { type: "order.updated", order: toOrderEvent(order) });
      }
      return NextResponse.json({ ok: true, session: toTableSessionEvent(updatedTargetSession) });
    }

    // action === "mark_paid"
    if (tableSession.status === "PAID") {
      return NextResponse.json({ error: "This table has already been paid." }, { status: 409 });
    }

    return closeTable(id, input.paymentMethod, input.paymentNote, session.shopId, session.adminId);
  } catch (error) {
    return handleApiError(error);
  }
}

async function closeTable(
  id: string,
  paymentMethod: string,
  paymentNote: string | undefined,
  shopId: string,
  adminId: string
) {
  const [updatedSession, completedOrders] = await db.$transaction(async (tx) => {
    const updated = await tx.tableSession.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidBy: adminId,
        paymentMethod,
        paymentNote: paymentNote ?? null,
      },
    });

    const openOrders = await tx.order.findMany({
      where: { tableSessionId: id, status: { in: [...OPEN_TICKET_STATUSES] } },
      include: { items: true },
    });

    const isVoid = paymentMethod === "VOID";
    const orders = await Promise.all(
      openOrders.map((o) =>
        tx.order.update({
          where: { id: o.id },
          data: {
            status: "COMPLETED",
            paymentStatus: isVoid ? "PENDING" : "PAID",
            paymentMethod: isVoid ? null : paymentMethod,
            paymentConfirmedBy: isVoid ? null : adminId,
            paymentConfirmedAt: isVoid ? null : new Date(),
          },
          include: { items: true },
        })
      )
    );

    return [updated, orders] as const;
  });

  publishOrderEvent(shopId, { type: "session.updated", session: toTableSessionEvent(updatedSession) });
  for (const order of completedOrders) {
    publishOrderEvent(shopId, { type: "order.updated", order: toOrderEvent(order) });
  }

  // closeTable() is shared by both mark_paid and release_table (void) —
  // notify with whichever of the two actually happened.
  if (paymentMethod !== "VOID") {
    createNotification(shopId, {
      type: "PAYMENT_RECEIVED",
      title: `Table ${updatedSession.tableNumber} — Payment received`,
      body: `Paid via ${paymentMethod}`,
      link: "/admin/tables",
    }).catch(() => {});
  } else {
    createNotification(shopId, {
      type: "TABLE_RELEASED",
      title: `Table ${updatedSession.tableNumber} released`,
      body: "Released without payment (void).",
      link: "/admin/tables",
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, session: toTableSessionEvent(updatedSession) });
}
