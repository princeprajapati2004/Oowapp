import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/customer-session";
import { getReferralStats } from "@/lib/services/referral";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requireCustomerSession();
    const { code, referrals, totalEarned } = await getReferralStats(session.shopId, session.customerId);
    return NextResponse.json({
      code,
      totalEarned,
      referrals: referrals.map((r) => ({
        id: r.id,
        referredName: r.referredCustomer.name,
        status: r.status,
        rewardAmount: r.rewardAmount == null ? null : Number(r.rewardAmount),
        createdAt: r.createdAt.toISOString(),
        rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
