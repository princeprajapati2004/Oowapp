import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { Prisma } from "@/generated/prisma/client";
import type { PlanInput, PlanUpdateInput, FeatureInput, PlanLimitsInput } from "@/lib/validation/plan";

export async function listPlans() {
  return db.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { planFeatures: { include: { feature: true } }, planLimits: true },
  });
}

export async function getPlan(id: string) {
  const plan = await db.plan.findUnique({
    where: { id },
    include: { planFeatures: { include: { feature: true } }, planLimits: true },
  });
  if (!plan) throw new NotFoundError("Plan not found");
  return plan;
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

/** Retire a plan — distinct from `updatePlan({isActive:false})` ("Disable", reversible,
 * zero effect on existing subscribers either way): archiving hides it from every public
 * plan list and create/upgrade/downgrade picker, while keeping it seeded so historical
 * Subscription rows that reference it still resolve a real Plan via planId/code. */
export async function archivePlan(id: string) {
  await assertPlanExists(id);
  return db.plan.update({ where: { id }, data: { isArchived: true, isActive: false } });
}

/** Clones a plan's name/pricing/features/limits into a new plan with a fresh code — the
 * Super Admin "Duplicate" action. The caller supplies the new unique `code`/`name`. */
export async function duplicatePlan(id: string, opts: { code: string; name: string }) {
  const source = await getPlan(id);
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.plan.create({
      data: {
        code: opts.code,
        name: opts.name,
        description: source.description,
        isActive: false, // duplicates start disabled — admin reviews before activating
        isArchived: false,
        sortOrder: source.sortOrder,
        monthlyPrice: source.monthlyPrice,
        annualPrice: source.annualPrice,
        currency: source.currency,
        isPopular: false,
        trialDays: source.trialDays,
      },
    });
    if (source.planFeatures.length > 0) {
      await tx.planFeature.createMany({
        data: source.planFeatures.map((pf: (typeof source.planFeatures)[number]) => ({ planId: created.id, featureId: pf.featureId, enabled: pf.enabled })),
      });
    }
    if (source.planLimits.length > 0) {
      await tx.planLimit.createMany({
        data: source.planLimits.map((pl: (typeof source.planLimits)[number]) => ({ planId: created.id, limitKey: pl.limitKey, limitValue: pl.limitValue })),
      });
    }
    return created;
  });
}

export async function setPlanLimits(planId: string, limits: PlanLimitsInput["limits"]) {
  await assertPlanExists(planId);
  return db.$transaction(
    limits.map((l) =>
      db.planLimit.upsert({
        where: { planId_limitKey: { planId, limitKey: l.limitKey } },
        create: { planId, limitKey: l.limitKey, limitValue: l.limitValue },
        update: { limitValue: l.limitValue },
      })
    )
  );
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
