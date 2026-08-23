import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { couponSchema } from "@/lib/validation/coupon";
import { updateCoupon, deleteCoupon } from "@/lib/services/coupon";
import { serializeCoupon } from "@/lib/serialize";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = couponSchema.parse(body);
    const coupon = await updateCoupon(session.shopId, id, input);
    return NextResponse.json(serializeCoupon(coupon));
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
    await deleteCoupon(session.shopId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
