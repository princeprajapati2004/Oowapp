import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { updateSubscriptionCoupon } from "@/lib/services/subscription-coupon";
import { subscriptionCouponUpdateSchema } from "@/lib/validation/subscription-coupon";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = subscriptionCouponUpdateSchema.parse(body);
    const coupon = await updateSubscriptionCoupon(id, input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "SUBSCRIPTION_COUPON_UPDATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "subscription_coupon",
      targetId: coupon.id,
      metadata: { changes: input },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}
