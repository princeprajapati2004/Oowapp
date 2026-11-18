import { requireAdminSession } from "@/lib/session";
import { getCurrentSubscription, computeDisplayStatus, computeDaysRemaining, computeGraceDaysRemaining } from "@/lib/services/subscription";
import { getUsageSnapshot } from "@/lib/services/subscription-limits";
import { db } from "@/lib/db";
import { SubscriptionPageClient } from "@/components/admin/subscription/subscription-page-client";

export default async function SubscriptionPage() {
  const session = await requireAdminSession();

  const [subscription, usage, plans, invoices] = await Promise.all([
    getCurrentSubscription(session.adminId),
    getUsageSnapshot(session.adminId),
    db.plan.findMany({
      where: { isActive: true, isArchived: false },
      orderBy: { sortOrder: "asc" },
      include: {
        planFeatures: { where: { enabled: true }, include: { feature: true } },
        planLimits: true,
        termsVersions: { where: { isActive: true } },
      },
    }),
    db.subscriptionTransaction.findMany({
      where: { adminId: session.adminId, status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      include: { plan: { select: { name: true } }, coupon: { select: { code: true } } },
    }),
  ]);

  const displayStatus = computeDisplayStatus(subscription);
  const daysRemaining = computeDaysRemaining(subscription.endDate);
  const graceDaysRemaining = computeGraceDaysRemaining(displayStatus, subscription.gracePeriodDays, daysRemaining);

  const activeTermsIds = plans
    .map((plan: (typeof plans)[number]) => plan.termsVersions[0]?.id)
    .filter((id: string | undefined): id is string => !!id);
  const acceptances = activeTermsIds.length
    ? await db.subscriptionTermsAcceptance.findMany({
        where: { adminId: session.adminId, termsVersionId: { in: activeTermsIds } },
        select: { termsVersionId: true },
      })
    : [];
  const acceptedTermsIds = new Set(acceptances.map((a: (typeof acceptances)[number]) => a.termsVersionId));

  const plansForClient = plans.map((plan: (typeof plans)[number]) => {
    const activeTerms = plan.termsVersions[0] ?? null;
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      sortOrder: plan.sortOrder,
      monthlyPrice: plan.monthlyPrice !== null ? Number(plan.monthlyPrice) : null,
      annualPrice: plan.annualPrice !== null ? Number(plan.annualPrice) : null,
      currency: plan.currency,
      isPopular: plan.isPopular,
      trialDays: plan.trialDays,
      features: plan.planFeatures.map((pf: (typeof plan.planFeatures)[number]) => ({ key: pf.feature.key, label: pf.feature.label })),
      limits: plan.planLimits.map((pl: (typeof plan.planLimits)[number]) => ({ limitKey: pl.limitKey, limitValue: pl.limitValue })),
      terms: activeTerms
        ? { id: activeTerms.id, content: activeTerms.content, version: activeTerms.version, accepted: acceptedTermsIds.has(activeTerms.id) }
        : null,
    };
  });

  const invoicesForClient = invoices.map((t: (typeof invoices)[number]) => ({
    id: t.id,
    invoiceNumber: t.invoiceNumber ?? "",
    planName: t.plan.name,
    billingCycle: t.billingCycle,
    baseAmount: Number(t.baseAmount),
    discountAmount: Number(t.discountAmount),
    taxAmount: Number(t.taxAmount),
    totalAmount: Number(t.totalAmount),
    currency: t.currency,
    couponCode: t.coupon?.code ?? null,
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
  }));

  return (
    <SubscriptionPageClient
      current={{
        planCode: subscription.planCode,
        planName: subscription.planName,
        resolvedPlanId: subscription.resolvedPlanId,
        status: displayStatus,
        endDate: subscription.endDate ? subscription.endDate.toISOString() : null,
        daysRemaining,
        graceDaysRemaining,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      }}
      usage={usage}
      plans={plansForClient}
      invoices={invoicesForClient}
    />
  );
}
