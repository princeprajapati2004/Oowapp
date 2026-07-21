import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/session";
import { NotFoundError } from "@/lib/api-utils";
import { getCurrentSubscription, computeDisplayStatus, isAccessGranting } from "@/lib/services/subscription";

export class FeatureNotEnabledError extends ForbiddenError {
  constructor(featureKey: string) {
    super(`This feature ("${featureKey}") is not enabled for your subscription.`);
    this.name = "FeatureNotEnabledError";
  }
}

/**
 * Resolution order (first match wins):
 *   1. BusinessFeaturePermission override for (shopId, featureKey) — Super Admin
 *      enabling/disabling a specific feature for this business.
 *   2. PlanFeature default for the shop's current subscription plan.
 *   3. Disabled (fail closed — an unknown/unseeded feature key is never enabled).
 *
 * If the subscription's effective status doesn't grant access (EXPIRED/SUSPENDED/
 * CANCELLED), every feature resolves to disabled regardless of plan or overrides —
 * this is the single choke point every premium route/page must call through.
 */
export async function resolveFeatures(shopId: string): Promise<Record<string, boolean>> {
  const [features, subscription, overrides] = await Promise.all([
    db.feature.findMany({ where: { isActive: true } }),
    getCurrentSubscription(shopId),
    db.businessFeaturePermission.findMany({ where: { shopId } }),
  ]);

  const result: Record<string, boolean> = {};
  for (const feature of features) result[feature.key] = false;

  const displayStatus = computeDisplayStatus(subscription);
  if (!isAccessGranting(displayStatus)) return result;

  if (subscription.resolvedPlanId) {
    const planFeatures = await db.planFeature.findMany({
      where: { planId: subscription.resolvedPlanId },
    });
    const featureById = new Map(features.map((f) => [f.id, f]));
    for (const pf of planFeatures) {
      const feature = featureById.get(pf.featureId);
      if (feature) result[feature.key] = pf.enabled;
    }
  }

  const featureById = new Map(features.map((f) => [f.id, f]));
  for (const override of overrides) {
    const feature = featureById.get(override.featureId);
    if (feature) result[feature.key] = override.enabled;
  }

  return result;
}

export async function isFeatureEnabled(shopId: string, featureKey: string): Promise<boolean> {
  const features = await resolveFeatures(shopId);
  return features[featureKey] ?? false;
}

/** Throws FeatureNotEnabledError (403 via the existing handleApiError) if disabled. */
export async function assertFeatureEnabled(shopId: string, featureKey: string): Promise<void> {
  if (!(await isFeatureEnabled(shopId, featureKey))) {
    throw new FeatureNotEnabledError(featureKey);
  }
}

// ─── Super Admin: per-business feature overrides ──────────────────────────────

export interface FeaturePermissionRow {
  featureId: string;
  key: string;
  label: string;
  description: string | null;
  category: string | null;
  enabled: boolean; // fully resolved value (override → plan default → disabled)
  hasOverride: boolean;
  overrideEnabled: boolean | null;
  overrideReason: string | null;
}

export async function getFeaturePermissionsForBusiness(shopId: string): Promise<FeaturePermissionRow[]> {
  const [features, overrides, resolved] = await Promise.all([
    db.feature.findMany({ where: { isActive: true }, orderBy: { key: "asc" } }),
    db.businessFeaturePermission.findMany({ where: { shopId } }),
    resolveFeatures(shopId),
  ]);

  const overrideByFeatureId = new Map(overrides.map((o) => [o.featureId, o]));

  return features.map((feature) => {
    const override = overrideByFeatureId.get(feature.id);
    return {
      featureId: feature.id,
      key: feature.key,
      label: feature.label,
      description: feature.description,
      category: feature.category,
      enabled: resolved[feature.key] ?? false,
      hasOverride: !!override,
      overrideEnabled: override?.enabled ?? null,
      overrideReason: override?.reason ?? null,
    };
  });
}

export async function setFeaturePermission(
  shopId: string,
  opts: { featureId: string; enabled: boolean; reason?: string | null; updatedBy: string }
) {
  const [shop, feature] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { id: true } }),
    db.feature.findUnique({ where: { id: opts.featureId } }),
  ]);
  if (!shop) throw new NotFoundError("Business not found");
  if (!feature) throw new NotFoundError("Feature not found");

  return db.businessFeaturePermission.upsert({
    where: { shopId_featureId: { shopId, featureId: opts.featureId } },
    create: {
      shopId,
      featureId: opts.featureId,
      enabled: opts.enabled,
      reason: opts.reason,
      updatedBy: opts.updatedBy,
    },
    update: {
      enabled: opts.enabled,
      reason: opts.reason,
      updatedBy: opts.updatedBy,
    },
  });
}
