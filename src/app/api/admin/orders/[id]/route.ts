import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { calculateBill } from "@/lib/services/billing";
import { sendOrderStatusNotification } from "@/lib/services/push";
import { createNotification } from "@/lib/services/notification";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import type { Prisma } from "@/generated/prisma/client";

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;

const updateOrderSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(ORDER_STATUSES) }),
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
    items: z.array(z.object({ id: z.string(), quantity: z.number().int().min(0) })).min(1),
  }),
  z.object({
    action: z.literal("mark_paid"),
    paymentMethod: z.enum(["CASH", "UPI", "QR", "CARD", "OTHER"]),
    paymentNote: z.string().trim().max(200).optional(),
  }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await (db.order as any).findFirst({
      where: { id, shopId: session.shopId },
      include: { items: true },
    });
    if (!order) throw new NotFoundError("Order not found");

    return NextResponse.json(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();

    const existing = await db.order.findFirst({ where: { id, shopId: session.shopId } });
    if (!existing) throw new NotFoundError("Order not found");

    // Support both old { status } format and new { action } format for backward compat.
    let data: Record<string, unknown>;

    if ("action" in body) {
      const parsed = updateOrderSchema.parse(body);

      if (parsed.action === "edit_items") {
        return handleEditItems(id, parsed.items, existing.shopId);
      }

      if (parsed.action === "status") {
        data = { status: parsed.status };
      } else if (parsed.action === "discount") {
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
        data = {
          discountType: null,
          discountValue: null,
          discountReason: null,
          discountedTotal: null,
        };
      } else if (parsed.action === "mark_paid") {
        data = {
          paymentMethod: parsed.paymentMethod,
          paymentStatus: "PAID",
          paymentConfirmedBy: session.adminId,
          paymentConfirmedAt: new Date(),
        };
      } else {
        // priority
        data = { priorityFlag: parsed.priorityFlag };
      }
    } else {
      // Legacy format: { status }
      const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
      const { status } = statusSchema.parse(body);
      data = { status };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db.order as any).update({ where: { id }, data, include: { items: true } });

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

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const order = await db.order.findFirst({ where: { id, shopId: session.shopId } });
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
  shopId: string
) {
  try {
    const taxes = await db.tax.findMany({ where: { shopId, isEnabled: true } });

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

      // Recalculate totals from remaining items.
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

      return tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: bill.subtotal,
          taxTotal: bill.taxTotal,
          grandTotal: bill.grandTotal,
          taxBreakdown: bill.taxLines as unknown as Prisma.InputJsonValue,
        },
        include: { items: true },
      });
    });

    publishOrderEvent(shopId, { type: "order.updated", order: toOrderEvent(updated) });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
