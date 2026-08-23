import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { referralConfigSchema } from "@/lib/validation/referral";
import { getReferralConfig, upsertReferralConfig } from "@/lib/services/referral";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const config = await getReferralConfig(session.shopId);
    return NextResponse.json(
      config
        ? { ...config, rewardAmount: Number(config.rewardAmount), minQualifyingOrderAmount: config.minQualifyingOrderAmount == null ? null : Number(config.minQualifyingOrderAmount) }
        : null
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = referralConfigSchema.parse(body);
    const config = await upsertReferralConfig(session.shopId, input);
    return NextResponse.json({
      ...config,
      rewardAmount: Number(config.rewardAmount),
      minQualifyingOrderAmount: config.minQualifyingOrderAmount == null ? null : Number(config.minQualifyingOrderAmount),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
