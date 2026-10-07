import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listSubscriptionCoupons, createSubscriptionCoupon } from "@/lib/services/subscription-coupon";
import { subscriptionCouponSchema } from "@/lib/validation/subscription-coupon";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET() {
  try {
    await requireSuperAdminSession();
    const coupons = await listSubscriptionCoupons();
    return NextResponse.json(coupons);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdminSession();
    const body = await request.json();
    const input = subscriptionCouponSchema.parse(body);
    const coupon = await createSubscriptionCoupon(input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "SUBSCRIPTION_COUPON_CREATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "subscription_coupon",
      targetId: coupon.id,
      metadata: { code: coupon.code },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(coupon, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
