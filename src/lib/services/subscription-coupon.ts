import { db } from "@/lib/db";
import { NotFoundError, SubscriptionCouponError } from "@/lib/api-utils";
import type { SubscriptionCouponInput, SubscriptionCouponUpdateInput } from "@/lib/validation/subscription-coupon";

export async function listSubscriptionCoupons() {
  return db.subscriptionCoupon.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createSubscriptionCoupon(input: SubscriptionCouponInput) {
  return db.subscriptionCoupon.create({ data: input });
}

async function assertCouponExists(id: string) {
  const coupon = await db.subscriptionCoupon.findUnique({ where: { id } });
  if (!coupon) throw new NotFoundError("Coupon not found");
  return coupon;
}

export async function updateSubscriptionCoupon(id: string, input: SubscriptionCouponUpdateInput) {
  await assertCouponExists(id);
  return db.subscriptionCoupon.update({ where: { id }, data: input });
}

export interface CouponPricing {
  couponId: string;
  code: string;
  discountAmount: number;
}

/**
 * Validates a coupon against a specific plan + amount and returns the discount — never
 * trusts a client-computed discount figure. Called both from the coupon-apply preview
 * (POST /api/admin/subscription/coupon/validate) and again, authoritatively, inside
 * subscription-checkout.ts::createCheckoutOrder right before creating the Razorpay
 * order, so a coupon that expired/hit its limit between "apply" and "pay" can't still
 * silently discount the charge.
 */
export async function validateAndPriceCoupon(
  code: string,
  opts: { adminId: string; planCode: string; baseAmount: number }
): Promise<CouponPricing> {
  const coupon = await db.subscriptionCoupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.isActive) throw new SubscriptionCouponError("This coupon code is invalid.");

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) throw new SubscriptionCouponError("This coupon is not active yet.");
  if (coupon.expiresAt && now > coupon.expiresAt) throw new SubscriptionCouponError("This coupon has expired.");

  if (coupon.applicablePlanCodes.length > 0 && !coupon.applicablePlanCodes.includes(opts.planCode)) {
    throw new SubscriptionCouponError("This coupon does not apply to the selected plan.");
  }

  if (coupon.minAmount !== null && opts.baseAmount < Number(coupon.minAmount)) {
    throw new SubscriptionCouponError(`This coupon requires a minimum amount of ${coupon.minAmount}.`);
  }

  if (coupon.totalUsageLimit !== null && coupon.usageCount >= coupon.totalUsageLimit) {
    throw new SubscriptionCouponError("This coupon has reached its usage limit.");
  }

  if (coupon.perAdminLimit !== null) {
    const usedByAdmin = await db.subscriptionCouponRedemption.count({ where: { couponId: coupon.id, adminId: opts.adminId } });
    if (usedByAdmin >= coupon.perAdminLimit) {
      throw new SubscriptionCouponError("You've already used this coupon the maximum number of times.");
    }
  }

  let discountAmount =
    coupon.discountType === "PERCENTAGE" ? (opts.baseAmount * Number(coupon.discountValue)) / 100 : Number(coupon.discountValue);

  if (coupon.maxDiscountAmount !== null) discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountAmount));
  discountAmount = Math.min(discountAmount, opts.baseAmount); // never discount more than the amount itself
  discountAmount = Math.round(discountAmount * 100) / 100;

  return { couponId: coupon.id, code: coupon.code, discountAmount };
}
