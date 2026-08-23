import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { couponSchema } from "@/lib/validation/coupon";
import { listCoupons, createCoupon } from "@/lib/services/coupon";
import { serializeCoupons, serializeCoupon } from "@/lib/serialize";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const coupons = await listCoupons(session.shopId);
    return NextResponse.json(serializeCoupons(coupons));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = couponSchema.parse(body);
    const coupon = await createCoupon(session.shopId, input);
    return NextResponse.json(serializeCoupon(coupon), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
