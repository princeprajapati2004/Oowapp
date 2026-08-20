import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { ForbiddenError } from "@/lib/session";
import { getCustomerSession } from "@/lib/customer-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { calculateBill } from "@/lib/services/billing";
import { sendOrderStatusNotification } from "@/lib/services/push";
import { createNotification } from "@/lib/services/notification";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import type { Prisma } from "@/generated/prisma/client";

// Orders placed by a guest (the common case, no customerId) keep using the
// unguessable cuid as their access token — unchanged. Orders placed by a
// logged-in customer account, though, must only be viewable/actionable by
// that same account: without this, any caller who learned the id could
// GET/cancel/edit another customer's order (see research notes).
async function assertOwnsOrderIfLinked(order: { shopId: string; customerId: string | null }) {
  if (!order.customerId) return;
  const session = await getCustomerSession();
  if (!session || session.customerId !== order.customerId || session.shopId !== order.shopId) {
    throw new ForbiddenError("You don't have access to this order.");
  }
}

// Once the kitchen has acted on an order, customer-initiated changes would be
// disruptive — only orders still awaiting confirmation/prep can be self-edited.
const EDITABLE_STATUSES = ["PENDING", "CONFIRMED"];

const cancelSchema = z.object({ action: z.literal("cancel") });
// Customer says "I've paid" (cash at counter or a UPI app) — records a claim
// for the owner to approve/reject via the existing mark_paid / new
// reject_payment_claim admin actions. Never marks the order paid by itself;
// the owner's decision is always the authoritative step.
const claimPaymentSchema = z.object({
  action: z.literal("claim_payment"),
  method: z.enum(["CASH", "UPI"]),
});
const updateItemsSchema = z.object({
  action: z.literal("update_items"),
  items: z
    .array(
      z.object({
        itemId: z.string(),
        // 0 removes the item; no meaningful upper bound ("unlimited"), just a
        // sanity ceiling against pathological input.
        quantity: z.number().int().nonnegative().max(100_000),
      })
    )
    .min(1),
});
const patchSchema = z.discriminatedUnion("action", [cancelSchema, claimPaymentSchema, updateItemsSchema]);

// Public lookup by id — the unguessable cuid is the access token, same model
// as the tracking page and the SSE stream. Used by the device-local order
// history page to resolve each remembered order id to its current state.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await db.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundError("Order not found");
    await assertOwnsOrderIfLinked(order);
    return NextResponse.json({ order: toOrderEvent(order) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`orders:patch:${ip}`, 20, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const body = await request.json();
    const input = patchSchema.parse(body);

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { categoryId: true } } } },
        shop: { include: { taxes: { where: { isEnabled: true } } } },
      },
    });
    if (!order) throw new NotFoundError("Order not found");
    await assertOwnsOrderIfLinked(order);

    // Payment claims aren't gated by EDITABLE_STATUSES — a customer can pay
    // an order that's already being prepared, just not one that's cancelled,
    // already fully paid, or a table-session order (those pay through the
    // session-level Final Bill flow instead).
    if (input.action === "claim_payment") {
      if (order.status === "CANCELLED") {
        return NextResponse.json({ error: "This order is cancelled." }, { status: 409 });
      }
      if (order.tableSessionId) {
        return NextResponse.json({ error: "Table orders are paid through the table's Final Bill instead." }, { status: 400 });
      }
      const finalTotal = Number(order.discountedTotal ?? order.grandTotal);
      const remaining = finalTotal - Number(order.paidAmount ?? 0);
      if (remaining <= 0.005) {
        return NextResponse.json({ error: "This order is already fully paid." }, { status: 409 });
      }

      const updated = await db.order.update({
        where: { id },
        data: { paymentClaimStatus: "PENDING", paymentClaimMethod: input.method, paymentClaimAt: new Date() },
        include: { items: true },
      });

      createNotification(order.shopId, {
        type: "PAYMENT_CLAIMED",
        title: `Order #${order.billNumber} — payment claimed`,
        body: `Customer says they paid ${remaining.toFixed(2)} via ${input.method === "UPI" ? "UPI" : "Cash"} — please verify.`,
        link: `/admin/orders/${id}`,
      }).catch(() => {});

      publishOrderEvent(order.shopId, { type: "order.updated", order: toOrderEvent(updated) });
      return NextResponse.json({ ok: true, order: toOrderEvent(updated) });
    }

    if (!EDITABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { error: "This order is already being prepared and can no longer be changed." },
        { status: 409 }
      );
    }

    if (input.action === "cancel") {
      const updated = await db.order.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: { items: true },
      });

      sendOrderStatusNotification(order.shopId, {
        billNumber: order.billNumber,
        status: "CANCELLED",
        orderId: id,
      }).catch(() => {});

      publishOrderEvent(order.shopId, { type: "order.updated", order: toOrderEvent(updated) });
      return NextResponse.json({ ok: true, order: toOrderEvent(updated) });
    }

    // action === "update_items"
    const knownItemIds = new Set(order.items.map((item) => item.id));
    for (const change of input.items) {
      if (!knownItemIds.has(change.itemId)) throw new NotFoundError("Item not found on this order");
    }

    // Table-session orders are permanent once submitted — the customer can
    // only add more via a new order against the same session, never shrink
    // or remove what's already been sent to the kitchen.
    if (order.tableSessionId) {
      for (const change of input.items) {
        const item = order.items.find((i) => i.id === change.itemId)!;
        if (change.quantity < item.quantity) {
          return NextResponse.json(
            { error: "Items already sent for a table order can't be reduced or removed — you can only add more." },
            { status: 400 }
          );
        }
      }
    }

    const remainingCount = order.items.filter((item) => {
      const change = input.items.find((c) => c.itemId === item.id);
      return change ? change.quantity > 0 : true;
    }).length;
    if (remainingCount === 0) {
      return NextResponse.json(
        { error: "An order needs at least one item — cancel it instead of removing everything." },
        { status: 400 }
      );
    }

    await db.$transaction(
      input.items.map((change) => {
        const item = order.items.find((i) => i.id === change.itemId)!;
        return change.quantity <= 0
          ? db.orderItem.delete({ where: { id: change.itemId } })
          : db.orderItem.update({
              where: { id: change.itemId },
              data: { quantity: change.quantity, lineTotal: Number(item.price) * change.quantity },
            });
      })
    );

    const freshItems = await db.orderItem.findMany({
      where: { orderId: id },
      include: { product: { select: { categoryId: true } } },
    });
    const bill = calculateBill(
      freshItems.map((item) => ({
        id: item.productId ?? item.id,
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity,
        categoryId: item.product?.categoryId ?? "",
      })),
      order.shop.taxes.map((t) => ({ ...t, value: Number(t.value) }))
    );

    let discountedTotal: number | null = null;
    if (order.discountType && order.discountValue !== null) {
      const discountValue = Number(order.discountValue);
      const discount =
        order.discountType === "PERCENTAGE" ? (bill.grandTotal * discountValue) / 100 : discountValue;
      discountedTotal = Math.max(0, bill.grandTotal - discount);
    }

    const updated = await db.order.update({
      where: { id },
      data: {
        subtotal: bill.subtotal,
        taxTotal: bill.taxTotal,
        grandTotal: bill.grandTotal,
        taxBreakdown: bill.taxLines as unknown as Prisma.InputJsonValue,
        discountedTotal,
      },
      include: { items: true },
    });

    publishOrderEvent(order.shopId, { type: "order.updated", order: toOrderEvent(updated) });
    return NextResponse.json({ ok: true, order: toOrderEvent(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}
