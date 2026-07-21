import { listPlans, listFeatures } from "@/lib/services/plan";
import { PlanManager } from "@/components/super-admin/plan-manager";

export default async function PlansPage() {
  const [plans, features] = await Promise.all([listPlans(), listFeatures()]);

  return (
    <div className="max-w-5xl">
      <PlanManager plans={plans} features={features} />
    </div>
  );
}
