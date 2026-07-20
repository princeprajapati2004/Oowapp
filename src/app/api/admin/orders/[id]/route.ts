import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { sendOrderStatusNotification } from "@/lib/services/push";

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
      } else {
        // remove_discount
        data = {
          discountType: null,
          discountValue: null,
          discountReason: null,
          discountedTotal: null,
        };
      }
    } else {
      // Legacy format: { status }
      const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
      const { status } = statusSchema.parse(body);
      data = { status };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db.order as any).update({ where: { id }, data });

    // Fire-and-forget push notification on status change
    if ("status" in data && typeof data.status === "string") {
      sendOrderStatusNotification(existing.shopId, {
        billNumber: existing.billNumber,
        status: data.status,
        orderId: id,
      }).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
