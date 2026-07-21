/**
 * Seed the Plan/Feature catalog and default plan-feature matrix (idempotent).
 * Run once, and again any time PLAN_CATALOG/FEATURE_CATALOG changes: npm run db:seed:plans
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PLAN_CATALOG, FEATURE_CATALOG, DEFAULT_PLAN_FEATURES } from "../src/lib/plans-features-catalog";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  for (const plan of PLAN_CATALOG) {
    await db.plan.upsert({
      where: { code: plan.code },
      update: { name: plan.name, description: plan.description, sortOrder: plan.sortOrder },
      create: plan,
    });
  }
  console.log(`Seeded ${PLAN_CATALOG.length} plans.`);

  for (const feature of FEATURE_CATALOG) {
    await db.feature.upsert({
      where: { key: feature.key },
      update: { label: feature.label, description: feature.description, category: feature.category },
      create: feature,
    });
  }
  console.log(`Seeded ${FEATURE_CATALOG.length} features.`);

  const allFeatures = await db.feature.findMany();
  let planFeatureCount = 0;
  for (const [planCode, enabledKeys] of Object.entries(DEFAULT_PLAN_FEATURES)) {
    const plan = await db.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      console.warn(`Skipping default features for unknown plan code: ${planCode}`);
      continue;
    }
    for (const feature of allFeatures) {
      const enabled = enabledKeys.includes(feature.key);
      await db.planFeature.upsert({
        where: { planId_featureId: { planId: plan.id, featureId: feature.id } },
        update: { enabled },
        create: { planId: plan.id, featureId: feature.id, enabled },
      });
      planFeatureCount += 1;
    }
  }
  console.log(`Seeded ${planFeatureCount} plan-feature entries.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
