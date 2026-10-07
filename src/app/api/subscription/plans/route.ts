import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

// Public — no session required. Powers the pricing/upgrade page's plan cards.
// Never returns archived plans (retired, hidden from every picker) or inactive ones
// (temporarily disabled). Prices/limits/features always come from the database —
// nothing here is hardcoded for the frontend to fall back on.
export async function GET() {
  try {
    const plans = await db.plan.findMany({
      where: { isActive: true, isArchived: false },
      orderBy: { sortOrder: "asc" },
      include: {
        planFeatures: { where: { enabled: true }, include: { feature: true } },
        planLimits: true,
      },
    });

    return NextResponse.json(
      plans.map((plan: (typeof plans)[number]) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        currency: plan.currency,
        isPopular: plan.isPopular,
        trialDays: plan.trialDays,
        features: plan.planFeatures.map((pf: (typeof plan.planFeatures)[number]) => ({ key: pf.feature.key, label: pf.feature.label, category: pf.feature.category })),
        limits: plan.planLimits.map((pl: (typeof plan.planLimits)[number]) => ({ limitKey: pl.limitKey, limitValue: pl.limitValue })),
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}
