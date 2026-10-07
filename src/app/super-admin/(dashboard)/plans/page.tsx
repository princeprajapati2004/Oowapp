import { listPlans, listFeatures } from "@/lib/services/plan";
import { PlanManager } from "@/components/super-admin/plan-manager";

export default async function PlansPage() {
  const [plans, features] = await Promise.all([listPlans(), listFeatures()]);

  // Decimal (monthlyPrice/annualPrice) can't cross the server/client boundary as-is.
  const plansForClient = plans.map((plan) => ({
    ...plan,
    monthlyPrice: plan.monthlyPrice !== null ? Number(plan.monthlyPrice) : null,
    annualPrice: plan.annualPrice !== null ? Number(plan.annualPrice) : null,
  }));

  return (
    <div className="max-w-5xl">
      <PlanManager plans={plansForClient} features={features} />
    </div>
  );
}
