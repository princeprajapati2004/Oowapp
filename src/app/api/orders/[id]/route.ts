import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { calculateBill } from "@/lib/services/billing";
import { sendOrderStatusNotification } from "@/lib/services/push";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import type { Prisma } from "@/generated/prisma/client";

// Once the kitchen has acted on an order, customer-initiated changes would be
// disruptive — only orders still awaiting confirmation/prep can be self-edited.
const EDITABLE_STATUSES = ["PENDING", "CONFIRMED"];

const cancelSchema = z.object({ action: z.literal("cancel") });
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
const patchSchema = z.discriminatedUnion("action", [cancelSchema, updateItemsSchema]);

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
