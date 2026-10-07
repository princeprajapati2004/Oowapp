import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { validateCouponSchema } from "@/lib/validation/subscription-coupon";
import { validateAndPriceCoupon } from "@/lib/services/subscription-coupon";
import { db } from "@/lib/db";

function priceForCycle(plan: { monthlyPrice: unknown; annualPrice: unknown }, cycle: "MONTHLY" | "ANNUAL"): number | null {
  const raw = cycle === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
  return raw === null ? null : Number(raw);
}

// Preview-only — re-validated authoritatively again inside subscription-checkout.ts
// right before the Razorpay order is created, so a coupon that expires/hits its limit
// between "apply" and "pay" can't still silently discount the actual charge.
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = validateCouponSchema.parse(body);

    const plan = await db.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new NotFoundError("Plan not found");

    const baseAmount = priceForCycle(plan, input.billingCycle);
    if (baseAmount === null) throw new NotFoundError("This plan has no self-service price for this billing cycle.");

    const priced = await validateAndPriceCoupon(input.code, { adminId: session.adminId, planCode: plan.code, baseAmount });

    return NextResponse.json({ valid: true, code: priced.code, baseAmount, discountAmount: priced.discountAmount });
  } catch (error) {
    return handleApiError(error);
  }
}
