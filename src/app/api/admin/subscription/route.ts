import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getSubscriptionSummaryForBusiness } from "@/lib/services/subscription";
import { resolveFeatures } from "@/lib/services/feature-permission";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const [summary, features] = await Promise.all([
      getSubscriptionSummaryForBusiness(session.shopId),
      resolveFeatures(session.shopId),
    ]);

    const enabledFeatures = Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    return NextResponse.json({ ...summary, enabledFeatures });
  } catch (error) {
    return handleApiError(error);
  }
}
