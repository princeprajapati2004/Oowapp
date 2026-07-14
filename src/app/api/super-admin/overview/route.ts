import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { PlatformAnalyticsService } from "@/lib/services/platform-analytics";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireSuperAdminSession();
    const [overview, recentSignups, subscriptionBreakdown] = await Promise.all([
      PlatformAnalyticsService.getOverview(),
      PlatformAnalyticsService.getRecentSignups(5),
      PlatformAnalyticsService.getSubscriptionBreakdown(),
    ]);
    return NextResponse.json({ overview, recentSignups, subscriptionBreakdown });
  } catch (error) {
    return handleApiError(error);
  }
}
