/**
 * One-time data migration: run AFTER `npm run db:seed:plans` (which seeds the
 * Feature/PlanFeature catalog) and BEFORE deploying any code that calls
 * assertFeatureEnabled/resolveFeatures against real traffic.
 *
 * Feature-gating enforcement (see src/lib/staff-permissions.ts... no, see
 * src/lib/services/feature-permission.ts) is being turned on for the first
 * time in this codebase. Every shop that already exists today has been using
 * Reports/Staff/Barcodes/Expenses/Delivery-tracking/Coupons freely, since
 * nothing ever enforced the Plan/Feature catalog before now. Most shops sit
 * on a FREE or STARTER subscription, whose plan-feature defaults do NOT
 * include several of these — flipping enforcement on without this migration
 * would immediately 403 real, currently-working functionality for real
 * businesses with no warning.
 *
 * This script writes an explicit BusinessFeaturePermission override
 * (enabled: true) for every EXISTING shop, for exactly the features this
 * pass of work gates. The override always wins over the plan default (see
 * resolveFeatures' resolution order), so every shop that exists at the
 * moment this script runs keeps its current access regardless of plan.
 * Shops created AFTER this script runs are untouched and correctly follow
 * the normal plan-tier defaults — grandfathering is deliberately a one-time,
 * point-in-time action, not an ongoing default.
 *
 * Idempotent (upsert) — safe to re-run. Run once: npx tsx scripts/grandfather-existing-shop-features.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

// Keep in sync with whichever features actually get a live enforcement call
// site added (nav guard / page guard / API guard) — see feature-gating audit
// notes. Do not add a key here that isn't also being enforced somewhere;
// grandfathering a feature nothing checks yet is a no-op that just adds
// noise to the Super Admin's per-business Feature Permissions panel.
const GRANDFATHERED_FEATURE_KEYS = [
  "advanced_reports",
  "multi_staff",
  "barcode_scanner",
  "expenses",
  "delivery",
  "coupons",
];

async function main() {
  const [shops, features] = await Promise.all([
    db.shop.findMany({ select: { id: true } }),
    db.feature.findMany({ where: { key: { in: GRANDFATHERED_FEATURE_KEYS } } }),
  ]);

  if (features.length !== GRANDFATHERED_FEATURE_KEYS.length) {
    const missing = GRANDFATHERED_FEATURE_KEYS.filter((k) => !features.some((f) => f.key === k));
    console.error(
      `Missing Feature rows for: ${missing.join(", ")} — run "npm run db:seed:plans" first.`
    );
    process.exit(1);
  }

  let count = 0;
  for (const shop of shops) {
    for (const feature of features) {
      await db.businessFeaturePermission.upsert({
        where: { shopId_featureId: { shopId: shop.id, featureId: feature.id } },
        update: { enabled: true, reason: "Grandfathered — pre-existing shop, feature-gating enforcement introduced" },
        create: {
          shopId: shop.id,
          featureId: feature.id,
          enabled: true,
          reason: "Grandfathered — pre-existing shop, feature-gating enforcement introduced",
          updatedBy: "system",
        },
      });
      count += 1;
    }
  }

  console.log(`Grandfathered ${shops.length} existing shop(s) × ${features.length} feature(s) = ${count} override(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
