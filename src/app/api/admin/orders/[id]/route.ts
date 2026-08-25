import { NextResponse } from "next/server";
import { z } from "zod";
import { ForbiddenError } from "@/lib/session";
import { requireShopActor, actorAuditFields, type ShopActor } from "@/lib/shop-actor";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { processOrderPaidRewards, voidPendingCashbackRedemption } from "@/lib/services/rewards";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { db } from "@/lib/db";
import { calculateBill } from "@/lib/services/billing";
import { resolveOrderItems } from "@/lib/services/order-items";
import { recomputePaymentStatus } from "@/lib/services/order-payment-status";
import { sendOrderStatusNotification } from "@/lib/services/push";
import { createNotification } from "@/lib/services/notification";
import { publishOrderEvent, toOrderEvent, toAdminOrderEvent } from "@/lib/server/order-events";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  CANCEL_REASONS,
  getNextStatuses,
  canCancel,
} from "@/lib/order-status";
import type { Prisma, StaffRole } from "@/generated/prisma/client";

const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]];

type UpdateOrderAction =
  | "status"
  | "discount"
  | "remove_discount"
  | "priority"
  | "edit_items"
  | "mark_paid"
  | "mark_refunded"
  | "reject_payment_claim"
  | "cancel"
  | "note";

// Kitchen only ever advances prep status / tags priority. Waiter handles the
// front-of-house/payment-collection actions (this is the same permission set
// Cash Counter — the waiter/manager screen — already exercises). Manager gets
// everything an owner could do on an individual order except deleting it
// outright (see the DELETE handler below, which is admin/MANAGER only).
const STAFF_ALLOWED_ACTIONS: Record<StaffRole, Set<UpdateOrderAction>> = {
  KITCHEN: new Set(["status", "priority"]),
  WAITER: new Set(["status", "priority", "edit_items", "cancel", "mark_paid", "reject_payment_claim", "note"]),
  MANAGER: new Set([
    "status",
    "priority",
    "edit_items",
    "cancel",
    "mark_paid",
    "mark_refunded",
    "reject_payment_claim",
    "note",
    "discount",
    "remove_discount",
  ]),
};

// Frontend buttons hide unavailable actions, but that's not security — every
// action is re-checked here regardless of what the UI happened to show.
function assertActorCanPerform(actor: ShopActor, action: UpdateOrderAction) {
  if (actor.kind === "admin") return;
  if (!STAFF_ALLOWED_ACTIONS[actor.staffRole].has(action)) {
    throw new ForbiddenError(`Your role (${actor.staffRole}) can't perform "${action}" on orders.`);
  }
}

const updateOrderSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(ORDER_STATUSES as [string, ...string[]]) }),
  z.object({
    action: z.literal("discount"),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    discountValue: z.number().positive().max(100_000),
    discountReason: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("remove_discount") }),
  z.object({ action: z.literal("priority"), priorityFlag: z.enum(["VIP", "RUSH"]).nullable() }),
  z.object({
    action: z.literal("edit_items"),
    // quantity: 0 removes the item entirely
    items: z.array(z.object({ id: z.string(), quantity: z.number().int().min(0) })).default([]),
    // Products not yet on this order — resolved server-side, price/name
    // never trusted from the client (same rule resolveOrderItems already
    // enforces for customer-facing order creation).
    newItems: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).default([]),
  }),
  z.object({
    action: z.literal("mark_paid"),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
    paidAmount: z.number().min(0).optional(),
    transactionReference: z.string().trim().max(100).optional(),
    paymentNote: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("mark_refunded"),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("reject_payment_claim") }),
  z.object({
    action: z.literal("cancel"),
    reason: z.enum([...CANCEL_REASONS]),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("note"),
    ownerNote: z.string().trim().max(1000),
  }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireShopActor();
    const { id } = await params;

    const order = await db.order.findFirst({
      where: { id, shopId: actor.shopId },
      include: {
        items: true,
        statusEvents: { orderBy: { changedAt: "asc" } },
        paymentRecords: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new NotFoundError("Order not found");

    return NextResponse.json(toAdminOrderEvent(order));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireShopActor();
    const { id } = await params;
    const body = await request.json();

    const existing = await db.order.findFirst({ where: { id, shopId: actor.shopId } });
    if (!existing) throw new NotFoundError("Order not found");

    // Support both old { status } format and new { action } format for backward compat.
    let data: Record<string, unknown>;
    let statusEventStatus: string | null = null;
    let auditEntry: { action: "ORDER_MARKED_PAID" | "ORDER_CANCELLED"; metadata: Record<string, unknown> } | null = null;
    let newPaymentRecord: {
      shopId: string;
      orderId: string;
      amount: number;
      method: string;
      transactionReference: string | null;
      note: string | null;
      recordedBy: string;
    } | null = null;
    let shouldVoidPendingCashback = false;
    let shouldProcessPaidRewards = false;

    if ("action" in body) {
      const parsed = updateOrderSchema.parse(body);
      assertActorCanPerform(actor, parsed.action);

      if (parsed.action === "edit_items") {
        return handleEditItems(id, parsed.items, parsed.newItems, existing, actor, request);
      }

      if (parsed.action === "status") {
        const allowed = getNextStatuses(existing);
        if (!allowed.includes(parsed.status as (typeof allowed)[number])) {
          return NextResponse.json(
            { error: `Order can't move from ${existing.status} to ${parsed.status}.` },
            { status: 409 }
          );
        }
        data = { status: parsed.status };
        statusEventStatus = parsed.status;
      } else if (parsed.action === "cancel") {
        if (!canCancel(existing)) {
          return NextResponse.json(
            { error: "This order can no longer be cancelled." },
            { status: 409 }
          );
        }
        data = {
          status: "CANCELLED",
          cancelReason: parsed.note ? `${parsed.reason}: ${parsed.note}` : parsed.reason,
          cancelledAt: new Date(),
          cancelledBy: actor.actorId,
        };
        statusEventStatus = "CANCELLED";
        auditEntry = { action: "ORDER_CANCELLED", metadata: { reason: parsed.reason, note: parsed.note } };
        shouldVoidPendingCashback = true;
      } else if (parsed.action === "mark_refunded") {
        if (existing.status !== "CANCELLED" || !["PAID", "PARTIALLY_PAID"].includes(existing.paymentStatus)) {
          return NextResponse.json(
            { error: "Only a cancelled, previously-paid order can be marked refunded." },
            { status: 409 }
          );
        }
        data = {
          paymentStatus: "REFUNDED",
          ownerNote: parsed.note
            ? [existing.ownerNote, `Refunded: ${parsed.note}`].filter(Boolean).join("\n")
            : existing.ownerNote,
        };
      } else if (parsed.action === "note") {
        data = { ownerNote: parsed.ownerNote };
      } else if (parsed.action === "discount") {
        if (existing.couponId) {
          return NextResponse.json(
            { error: "This order already has a coupon discount — it can't be combined with a manual one." },
            { status: 409 }
          );
        }
        const subtotal = Number(existing.subtotal);
        const taxTotal = Number(existing.taxTotal);
        const base = subtotal + taxTotal;
        const discount =
          parsed.discountType === "PERCENTAGE"
            ? (base * parsed.discountValue) / 100
            : parsed.discountValue;

        if (discount > base) {
          return NextResponse.json(
            { error: "Discount cannot exceed the order total" },
            { status: 400 }
          );
        }

        data = {
          discountType: parsed.discountType,
          discountValue: parsed.discountValue,
          discountReason: parsed.discountReason ?? null,
          discountedTotal: Math.max(0, base - discount),
        };
      } else if (parsed.action === "remove_discount") {
        if (existing.couponId) {
          return NextResponse.json(
            { error: "Coupon discounts can't be removed here — cancel the order instead if needed." },
            { status: 409 }
          );
        }
        data = {
          discountType: null,
          discountValue: null,
          discountReason: null,
          discountedTotal: null,
        };
      } else if (parsed.action === "mark_paid") {
        const finalTotal = Number(existing.discountedTotal ?? existing.grandTotal);
        const paidAmount = parsed.paidAmount ?? finalTotal;
        const previouslyPaid = Number(existing.paidAmount ?? 0);
        data = {
          paymentMethod: parsed.paymentMethod,
          paymentStatus: paidAmount + 0.005 >= finalTotal ? "PAID" : "PARTIALLY_PAID",
          paidAmount,
          transactionReference: parsed.transactionReference || null,
          paymentConfirmedBy: actor.actorId,
          paymentConfirmedAt: new Date(),
          // A real recorded payment resolves any pending customer claim,
          // however it was triggered (quick-approve or the full modal).
          paymentClaimStatus: null,
          paymentClaimMethod: null,
          paymentClaimAt: null,
        };
        shouldProcessPaidRewards = data.paymentStatus === "PAID";
        // The amount actually collected THIS transaction — paidAmount is the
        // new cumulative total, not a delta — logged as its own history row
        // only when it represents real new money (not just correcting the
        // method/reference on an unchanged amount).
        const collectedNow = paidAmount - previouslyPaid;
        if (collectedNow > 0.005) {
          newPaymentRecord = {
            shopId: actor.shopId,
            orderId: id,
            amount: collectedNow,
            method: parsed.paymentMethod,
            transactionReference: parsed.transactionReference || null,
            note: parsed.paymentNote || null,
            recordedBy: actor.actorId,
          };
        }
        auditEntry = {
          action: "ORDER_MARKED_PAID",
          metadata: { paymentMethod: parsed.paymentMethod, paidAmount, paymentStatus: data.paymentStatus },
        };
      } else if (parsed.action === "reject_payment_claim") {
        if (existing.paymentClaimStatus !== "PENDING") {
          return NextResponse.json({ error: "There's no pending payment claim to reject." }, { status: 409 });
        }
        data = { paymentClaimStatus: "REJECTED" };
      } else {
        // priority
        data = { priorityFlag: parsed.priorityFlag };
      }
    } else {
      // Legacy format: { status }
      assertActorCanPerform(actor, "status");
      const statusSchema = z.object({ status: z.enum(ORDER_STATUSES as [string, ...string[]]) });
      const { status } = statusSchema.parse(body);
      const allowed = getNextStatuses(existing);
      if (!allowed.includes(status as (typeof allowed)[number])) {
        return NextResponse.json(
          { error: `Order can't move from ${existing.status} to ${status}.` },
          { status: 409 }
        );
      }
      data = { status };
      statusEventStatus = status;
    }

    // `data` is built dynamically per-action above, so it can't line up with
    // Prisma's precise OrderUpdateInput type — same cast the rest of this
    // route already relied on before this change.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db.order as any).update({ where: { id }, data, include: { items: true } });

    if (shouldProcessPaidRewards) {
      await db.$transaction((tx) => processOrderPaidRewards(tx, updated));
    }
    if (shouldVoidPendingCashback) {
      await db.$transaction((tx) => voidPendingCashbackRedemption(tx, id));
    }

    if (newPaymentRecord) {
      await db.paymentRecord.create({ data: newPaymentRecord });
    }
    const paymentRecords = await db.paymentRecord.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    });

    if (statusEventStatus) {
      await db.orderStatusEvent.create({
        data: {
          orderId: id,
          status: statusEventStatus as Prisma.OrderStatusEventCreateInput["status"],
          changedBy: actor.actorId,
        },
      });
    }
    const statusEvents = await db.orderStatusEvent.findMany({
      where: { orderId: id },
      orderBy: { changedAt: "asc" },
    });

    // Fire-and-forget push notification on status change
    if ("status" in data && typeof data.status === "string") {
      sendOrderStatusNotification(existing.shopId, {
        billNumber: existing.billNumber,
        status: data.status,
        orderId: id,
      }).catch(() => {});

      createNotification(existing.shopId, {
        type: "ORDER_STATUS_CHANGED",
        title: `Order #${existing.billNumber} — ${data.status}`,
        body: `Status updated to ${data.status.toLowerCase()}`,
        link: `/admin/orders/${id}`,
      }).catch(() => {});
    }

    publishOrderEvent(existing.shopId, { type: "order.updated", order: toOrderEvent(updated) });

    if (auditEntry) {
      const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
      writeAuditLog({
        action: auditEntry.action,
        ...actorAuditFields(actor),
        targetType: "order",
        targetId: id,
        shopId: actor.shopId,
        metadata: { ...auditEntry.metadata, billNumber: existing.billNumber },
        ipAddress,
        userAgent,
        requestId,
      });
    }

    return NextResponse.json(toAdminOrderEvent({ ...updated, statusEvents, paymentRecords }));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireShopActor("MANAGER");
    const { id } = await params;
    const order = await db.order.findFirst({ where: { id, shopId: actor.shopId } });
    if (!order) throw new NotFoundError("Order not found");
    await db.order.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleEditItems(
  orderId: string,
  updates: { id: string; quantity: number }[],
  newItems: { productId: string; quantity: number }[],
  existing: NonNullable<Awaited<ReturnType<typeof db.order.findFirst>>>,
  actor: ShopActor,
  request: Request
) {
  try {
    const shopId = existing.shopId;
    const taxes = await db.tax.findMany({ where: { shopId, isEnabled: true } });
    // Real product data only — never a client-sent name/price. Read outside
    // the transaction since it's a plain lookup, same as the customer-facing
    // order route's resolveOrderItems call.
    const resolvedNewItems = newItems.length > 0 ? await resolveOrderItems(shopId, newItems) : [];

    const updated = await db.$transaction(async (tx) => {
      // Apply quantity changes — delete items with qty 0. Every item id is
      // re-checked against orderId here so a caller can't reference an
      // OrderItem belonging to a different order (or another shop's order).
      for (const u of updates) {
        if (u.quantity === 0) {
          await tx.orderItem.deleteMany({ where: { id: u.id, orderId } });
        } else {
          const item = await tx.orderItem.findFirst({ where: { id: u.id, orderId } });
          if (item) {
            await tx.orderItem.update({
              where: { id: u.id },
              data: { quantity: u.quantity, lineTotal: Number(item.price) * u.quantity },
            });
          }
        }
      }

      // Merge a newly-added product into its existing line rather than a
      // second row for the same item (brief's "don't duplicate the line"
      // rule) — the merged quantity keeps that line's original frozen
      // price rather than mixing in the product's current price.
      for (const item of resolvedNewItems) {
        const existingLine = await tx.orderItem.findFirst({ where: { orderId, productId: item.productId } });
        if (existingLine) {
          const newQuantity = existingLine.quantity + item.quantity;
          await tx.orderItem.update({
            where: { id: existingLine.id },
            data: { quantity: newQuantity, lineTotal: Number(existingLine.price) * newQuantity },
          });
        } else {
          await tx.orderItem.create({
            data: {
              orderId,
              productId: item.productId,
              name: item.name,
              price: item.price,
              costPrice: item.costPrice,
              quantity: item.quantity,
              lineTotal: item.price * item.quantity,
            },
          });
        }
      }

      // Recalculate totals from the final item set.
      const remaining = await tx.orderItem.findMany({
        where: { orderId },
        include: { product: { select: { categoryId: true } } },
      });

      const lineItems = remaining.map((item) => ({
        id: item.productId ?? item.name,
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity,
        categoryId: item.product?.categoryId ?? "",
      }));

      const bill = calculateBill(
        lineItems,
        taxes.map((t) => ({ ...t, value: Number(t.value) }))
      );

      // A manual (non-coupon) discount is recomputed against the new base
      // so it doesn't go stale. A coupon's discount amount is left exactly
      // as-is — re-validating coupon eligibility against a changed cart is
      // out of scope (mirrors remove_discount's existing refusal to touch
      // coupon-based orders).
      let discountedTotal = existing.discountedTotal != null ? Number(existing.discountedTotal) : null;
      if (existing.discountType && !existing.couponId) {
        const base = bill.subtotal + bill.taxTotal;
        const discount =
          existing.discountType === "PERCENTAGE"
            ? (base * Number(existing.discountValue)) / 100
            : Number(existing.discountValue);
        discountedTotal = Math.max(0, base - discount);
      }

      // Payment status must track paidAmount vs. the (possibly now
      // different) total, in both directions — a PAID order whose total
      // grew becomes PARTIALLY_PAID, and one that's PARTIALLY_PAID can
      // become PAID again if items are removed and what's already collected
      // now covers the reduced total. Only kicks in once something has
      // actually been paid (paidAmount > 0) — an order nobody has paid
      // anything on yet stays PENDING regardless of item changes, and a
      // REFUNDED order is a terminal state left untouched either way.
      // paidAmount itself and PaymentRecord history are never modified here.
      const finalTotal = discountedTotal ?? bill.grandTotal;
      const paidAmount = Number(existing.paidAmount ?? 0);
      const paymentStatus = recomputePaymentStatus(existing.paymentStatus, paidAmount, finalTotal);

      return tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: bill.subtotal,
          taxTotal: bill.taxTotal,
          grandTotal: bill.grandTotal,
          taxBreakdown: bill.taxLines as unknown as Prisma.InputJsonValue,
          discountedTotal,
          paymentStatus,
        },
        include: { items: true },
      });
    });

    publishOrderEvent(shopId, { type: "order.updated", order: toOrderEvent(updated) });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "ORDER_ITEMS_EDITED",
      ...actorAuditFields(actor),
      targetType: "order",
      targetId: orderId,
      shopId,
      metadata: {
        billNumber: existing.billNumber,
        quantityChanges: updates,
        addedItems: resolvedNewItems.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity })),
        previousTotal: Number(existing.discountedTotal ?? existing.grandTotal),
        newTotal: Number(updated.discountedTotal ?? updated.grandTotal),
      },
      ipAddress,
      userAgent,
      requestId,
    });

    // handleEditItems returns directly (it never reaches the shared
    // toAdminOrderEvent/paymentRecords/statusEvents assembly below the main
    // action dispatch) — so it has to do that assembly itself, or the
    // response comes back shaped like a raw Prisma row instead of an
    // AdminOrderEventOrder (Decimal/Date fields, no statusEvents/
    // paymentRecords arrays at all), which crashes the page on render.
    const [paymentRecords, statusEvents] = await Promise.all([
      db.paymentRecord.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } }),
      db.orderStatusEvent.findMany({ where: { orderId }, orderBy: { changedAt: "asc" } }),
    ]);

    return NextResponse.json(toAdminOrderEvent({ ...updated, statusEvents, paymentRecords }));
  } catch (error) {
    return handleApiError(error);
  }
}
