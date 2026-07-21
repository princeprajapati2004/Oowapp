import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { PlanInput, PlanUpdateInput, FeatureInput } from "@/lib/validation/plan";

export async function listPlans() {
  return db.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { planFeatures: { include: { feature: true } } },
  });
}

export async function createPlan(input: PlanInput) {
  return db.plan.create({ data: input });
}

async function assertPlanExists(id: string) {
  const plan = await db.plan.findUnique({ where: { id } });
  if (!plan) throw new NotFoundError("Plan not found");
  return plan;
}

export async function updatePlan(id: string, input: PlanUpdateInput) {
  await assertPlanExists(id);
  return db.plan.update({ where: { id }, data: input });
}

export async function listFeatures() {
  return db.feature.findMany({ orderBy: { key: "asc" } });
}

export async function createFeature(input: FeatureInput) {
  return db.feature.create({ data: input });
}

export async function setPlanFeatures(planId: string, features: { featureId: string; enabled: boolean }[]) {
  await assertPlanExists(planId);
  return db.$transaction(
    features.map((f) =>
      db.planFeature.upsert({
        where: { planId_featureId: { planId, featureId: f.featureId } },
        create: { planId, featureId: f.featureId, enabled: f.enabled },
        update: { enabled: f.enabled },
      })
    )
  );
}
