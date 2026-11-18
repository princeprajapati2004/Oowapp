import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getUsageHistory, getUsageSummaryByFeature, getBillingPeriodRange } from "@/lib/services/subscription-usage";

type RangePreset = "today" | "7d" | "30d" | "current_period" | "previous_period" | "custom";

async function resolveRange(adminId: string, url: URL): Promise<{ from?: Date; to?: Date }> {
  const preset = (url.searchParams.get("range") ?? "30d") as RangePreset;
  const now = new Date();

  switch (preset) {
    case "today": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from };
    }
    case "7d":
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    case "30d":
      return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    case "current_period": {
      const period = await getBillingPeriodRange(adminId, "current");
      return period ? { from: period.from, to: period.to ?? undefined } : {};
    }
    case "previous_period": {
      const period = await getBillingPeriodRange(adminId, "previous");
      return period ? { from: period.from, to: period.to ?? undefined } : {};
    }
    case "custom": {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      return {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
    }
    default:
      return {};
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const url = new URL(request.url);
    const featureKey = url.searchParams.get("featureKey") ?? undefined;
    const { from, to } = await resolveRange(session.adminId, url);

    const [rows, summary] = await Promise.all([
      getUsageHistory(session.adminId, { from, to, featureKey }),
      getUsageSummaryByFeature(session.adminId, { from, to, featureKey }),
    ]);

    return NextResponse.json({
      rows: rows.map((r: (typeof rows)[number]) => ({
        id: r.id,
        shopName: r.shop.businessName,
        featureKey: r.featureKey,
        action: r.action,
        actorType: r.actorType,
        actorId: r.actorId,
        relatedRecordId: r.relatedRecordId,
        createdAt: r.createdAt.toISOString(),
      })),
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
