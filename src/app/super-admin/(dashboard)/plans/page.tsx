import { listPlans, listFeatures, getCurrentSubscriberCountsByPlan } from "@/lib/services/plan";
import { PlanManager } from "@/components/super-admin/plan-manager";

export default async function PlansPage() {
  const [plans, features, subscriberCounts] = await Promise.all([
    listPlans(),
    listFeatures(),
    getCurrentSubscriberCountsByPlan(),
  ]);

  // Decimal (monthlyPrice/annualPrice) can't cross the server/client boundary as-is.
  const plansForClient = plans.map((plan: Awaited<ReturnType<typeof listPlans>>[number]) => ({
    ...plan,
    monthlyPrice: plan.monthlyPrice !== null ? Number(plan.monthlyPrice) : null,
    annualPrice: plan.annualPrice !== null ? Number(plan.annualPrice) : null,
    subscriberCount: subscriberCounts[plan.id] ?? 0,
  }));

  return (
    <div className="max-w-5xl">
      <PlanManager plans={plansForClient} features={features} />
    </div>
  );
}
