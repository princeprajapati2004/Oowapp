import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listReferrals } from "@/lib/services/referral";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const referrals = await listReferrals(session.shopId);

    const serialized = referrals.map((r) => ({
      id: r.id,
      referrerName: r.referrerCustomer.name,
      referrerPhone: r.referrerCustomer.phone,
      referrerCode: r.referrerCustomer.referralCode,
      referredName: r.referredCustomer.name,
      referredPhone: r.referredCustomer.phone,
      status: r.status,
      rewardAmount: r.rewardAmount == null ? null : Number(r.rewardAmount),
      createdAt: r.createdAt.toISOString(),
      rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
      qualifyingOrderId: r.qualifyingOrderId,
    }));

    const stats = {
      total: serialized.length,
      pending: serialized.filter((r) => r.status === "PENDING").length,
      rewarded: serialized.filter((r) => r.status === "REWARDED").length,
      totalCredited: serialized.reduce((sum, r) => sum + (r.status === "REWARDED" ? (r.rewardAmount ?? 0) : 0), 0),
    };

    return NextResponse.json({ referrals: serialized, stats });
  } catch (error) {
    return handleApiError(error);
  }
}
