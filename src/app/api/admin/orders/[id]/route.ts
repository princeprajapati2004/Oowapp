import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;

const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const { status } = updateOrderSchema.parse(body);

    const existing = await db.order.findFirst({ where: { id, shopId: session.shopId } });
    if (!existing) throw new NotFoundError("Order not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db.order as any).update({
      where: { id },
      data: { status },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
