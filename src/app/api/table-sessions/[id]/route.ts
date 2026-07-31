import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeSessionBill } from "@/lib/services/table-session";
import { sendBillRequestNotification } from "@/lib/services/push";
import { createNotification } from "@/lib/services/notification";
import { publishOrderEvent, toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";

const patchSchema = z.object({ action: z.literal("request_bill") });

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
    patchSchema.parse(body);

    const session = await loadSession(id);

    // "request_bill" is the only supported action here. Marking a table PAID
    // is staff-only, via PATCH /api/admin/table-sessions/[id] (mark_paid).
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
    createNotification(session.shopId, {
      type: "BILL_REQUESTED",
      title: `Bill requested — Table ${session.tableNumber}`,
      body: "Customer is ready to pay.",
      link: "/admin/tables",
    }).catch(() => {});
    publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updated) });

    return NextResponse.json({ ok: true, session: toTableSessionEvent(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}
