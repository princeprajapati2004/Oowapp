import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { SubscriptionDuration, SubscriptionPlan as LegacyPlanEnum } from "@/generated/prisma/client";
import {
  getCurrentSubscription,
  computeDisplayStatus,
  computeDaysRemaining,
  addDurationDays,
  isAccessGranting,
  DEFAULT_TRIAL_DURATION,
  type DisplayStatus,
} from "@/lib/services/subscription";

// Super Admin–facing mutations and read views for subscriptions. Kept separate from
// src/lib/services/subscription.ts (the read-only business-owner view + core resolution
// helpers from Phase 1) so that file never needs to change for this work — this module
// only adds new capability on top of it.

async function assertShopExists(shopId: string) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true } });
  if (!shop) throw new NotFoundError("Business not found");
}

async function resolvePlanByCode(code: string) {
  const plan = await db.plan.findUnique({ where: { code } });
  if (!plan) throw new NotFoundError(`Plan "${code}" not found`);
  return plan;
}

const LEGACY_PLAN_CODES = new Set(["FREE", "STARTER", "PRO", "ENTERPRISE"]);

// The `plan` enum column is a deprecated bridge (SUBSCRIPTION_POS_ARCHITECTURE.md,
// Decision A) — `planId` is authoritative going forward. A plan created later with a
// code outside the legacy enum can't be represented in this column, so it falls back to
// FREE; every reader resolves the real plan via planId, never this column.
function legacyPlanColumnValue(code: string): LegacyPlanEnum {
  return (LEGACY_PLAN_CODES.has(code) ? code : "FREE") as LegacyPlanEnum;
}

function resolveEndDate(startDate: Date, duration: SubscriptionDuration, explicitEndDate?: Date): Date {
  if (duration === "CUSTOM") {
    if (!explicitEndDate) throw new Error("A custom duration requires an explicit end date.");
    return explicitEndDate;
  }
  return addDurationDays(startDate, duration);
}

interface MutationActor {
  createdBy: string;
  remarks?: string;
}

/** Super Admin explicitly provisions a subscription (initial or a forced fresh cycle). */
export async function createSubscription(
  shopId: string,
  opts: MutationActor & { planCode: string; duration: SubscriptionDuration; endDate?: Date }
) {
  await assertShopExists(shopId);
  const plan = await resolvePlanByCode(opts.planCode);
  const startDate = new Date();
  const endDate = resolveEndDate(startDate, opts.duration, opts.endDate);

  return db.subscription.create({
    data: {
      shopId,
      plan: legacyPlanColumnValue(plan.code),
      planId: plan.id,
      status: "ACTIVE",
      duration: opts.duration,
      action: "CREATED",
      startDate,
      endDate,
      createdBy: opts.createdBy,
      remarks: opts.remarks,
    },
  });
}

export async function renewSubscription(
  shopId: string,
  opts: MutationActor & { duration: SubscriptionDuration; endDate?: Date }
) {
  await assertShopExists(shopId);
  const current = await getCurrentSubscription(shopId);
  const startDate = new Date();
  const endDate = resolveEndDate(startDate, opts.duration, opts.endDate);

  return db.subscription.create({
    data: {
      shopId,
      plan: legacyPlanColumnValue(current.planCode),
      planId: current.resolvedPlanId,
      status: "ACTIVE",
      duration: opts.duration,
      action: "RENEWED",
      startDate,
      endDate,
      createdBy: opts.createdBy,
      remarks: opts.remarks,
    },
  });
}

export async function extendSubscription(
  shopId: string,
  opts: MutationActor & { duration: SubscriptionDuration; endDate?: Date }
) {
  await assertShopExists(shopId);
  const current = await getCurrentSubscription(shopId);
  const base = current.endDate && current.endDate > new Date() ? current.endDate : new Date();
  const endDate = resolveEndDate(base, opts.duration, opts.endDate);

  return db.subscription.create({
    data: {
      shopId,
      plan: legacyPlanColumnValue(current.planCode),
      planId: current.resolvedPlanId,
      status: current.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
      duration: opts.duration,
      action: "EXTENDED",
      startDate: current.startDate,
      endDate,
      createdBy: opts.createdBy,
      remarks: opts.remarks,
    },
  });
}

export async function changePlan(shopId: string, opts: MutationActor & { planCode: string }) {
  await assertShopExists(shopId);
  const current = await getCurrentSubscription(shopId);
  const plan = await resolvePlanByCode(opts.planCode);

  return db.subscription.create({
    data: {
      shopId,
      plan: legacyPlanColumnValue(plan.code),
      planId: plan.id,
      status: current.status,
      duration: current.duration,
      action: "PLAN_CHANGED",
      startDate: current.startDate,
      endDate: current.endDate,
      createdBy: opts.createdBy,
      remarks: opts.remarks,
    },
  });
}

export async function suspendSubscription(shopId: string, opts: MutationActor) {
  await assertShopExists(shopId);
  const current = await getCurrentSubscription(shopId);

  return db.subscription.create({
    data: {
      shopId,
      plan: legacyPlanColumnValue(current.planCode),
      planId: current.resolvedPlanId,
      status: "SUSPENDED",
      duration: current.duration,
      action: "SUSPENDED",
      startDate: current.startDate,
      endDate: current.endDate,
      createdBy: opts.createdBy,
      remarks: opts.remarks,
    },
  });
}

export async function resumeSubscription(shopId: string, opts: MutationActor) {
  await assertShopExists(shopId);
  const current = await getCurrentSubscription(shopId);
  if (current.status !== "SUSPENDED") {
    throw new Error("Subscription is not currently suspended.");
  }

  return db.subscription.create({
    data: {
      shopId,
      plan: legacyPlanColumnValue(current.planCode),
      planId: current.resolvedPlanId,
      status: "ACTIVE",
      duration: current.duration,
      action: "RESUMED",
      startDate: current.startDate,
      endDate: current.endDate,
      createdBy: opts.createdBy,
      remarks: opts.remarks,
    },
  });
}

export async function expireSubscription(shopId: string, opts: MutationActor) {
  await assertShopExists(shopId);
  const current = await getCurrentSubscription(shopId);

  return db.subscription.create({
    data: {
      shopId,
      plan: legacyPlanColumnValue(current.planCode),
      planId: current.resolvedPlanId,
      status: "EXPIRED",
      duration: current.duration,
      action: "EXPIRED",
      startDate: current.startDate,
      endDate: new Date(),
      createdBy: opts.createdBy,
      remarks: opts.remarks,
    },
  });
}

export async function getSubscriptionDetailForSuperAdmin(shopId: string) {
  await assertShopExists(shopId);
  const [current, historyRows] = await Promise.all([
    getCurrentSubscription(shopId),
    db.subscription.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      include: { planRef: true },
    }),
  ]);

  return {
    current: {
      ...current,
      displayStatus: computeDisplayStatus(current),
      daysRemaining: computeDaysRemaining(current.endDate),
    },
    history: historyRows.map((row) => ({
      id: row.id,
      planCode: row.planRef?.code ?? row.plan,
      planName: row.planRef?.name ?? row.plan,
      status: row.status,
      duration: row.duration,
      action: row.action,
      startDate: row.startDate,
      endDate: row.endDate,
      createdBy: row.createdBy,
      remarks: row.remarks,
      createdAt: row.createdAt,
    })),
  };
}

export interface SubscriptionListFilters {
  search?: string;
  businessType?: string;
  status?: DisplayStatus;
  planCode?: string;
  expiryBefore?: Date;
  page?: number;
  perPage?: number;
}

export async function listBusinessSubscriptions(filters: SubscriptionListFilters = {}) {
  const { search, businessType, planCode, status, expiryBefore, page = 1, perPage = 20 } = filters;

  const shops = await db.shop.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search, mode: "insensitive" as const } },
              { admin: { email: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
      ...(businessType ? { businessType: businessType as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { admin: { select: { email: true } } },
  });
  const shopIds = shops.map((s) => s.id);

  // Batched instead of one getCurrentSubscription() call per shop — this list can span
  // every business on the platform, and N+1 queries against a remote pooled Postgres
  // made the page slow enough to trip Turbopack dev-mode's RSC stream handling.
  const [allSubs, plans] = await Promise.all([
    db.subscription.findMany({
      where: { shopId: { in: shopIds } },
      orderBy: { createdAt: "desc" },
      include: { planRef: true },
    }),
    db.plan.findMany(),
  ]);

  const latestByShop = new Map<string, (typeof allSubs)[number]>();
  for (const sub of allSubs) {
    if (!latestByShop.has(sub.shopId)) latestByShop.set(sub.shopId, sub);
  }
  const planByCode = new Map(plans.map((p) => [p.code, p]));
  const freePlan = planByCode.get("FREE");

  let rows = shops.map((shop) => {
    const latest = latestByShop.get(shop.id);
    const startDate = latest?.startDate ?? shop.createdAt;
    const record = {
      status: latest?.status ?? ("TRIAL" as const),
      endDate: latest?.endDate ?? addDurationDays(startDate, DEFAULT_TRIAL_DURATION),
    };
    // Mirrors getCurrentSubscription's resolution order: planId FK first, then the
    // legacy plan-code bridge fallback, then FREE for shops with no row at all.
    const resolvedPlan = latest?.planRef ?? (latest ? planByCode.get(latest.plan) : freePlan) ?? null;

    return {
      shopId: shop.id,
      slug: shop.slug,
      logoUrl: shop.logoUrl,
      businessName: shop.businessName,
      ownerName: shop.ownerName,
      businessType: shop.businessType as string,
      phone: shop.phone,
      email: shop.admin.email,
      resolvedPlanId: resolvedPlan?.id ?? null,
      planCode: resolvedPlan?.code ?? latest?.plan ?? "FREE",
      planName: resolvedPlan?.name ?? latest?.plan ?? "Free",
      status: computeDisplayStatus(record),
      accountStatus: shop.status as string,
      startDate,
      endDate: record.endDate,
      daysRemaining: computeDaysRemaining(record.endDate),
      enabledFeatures: [] as string[],
    };
  });

  if (planCode) rows = rows.filter((r) => r.planCode === planCode);
  if (status) rows = rows.filter((r) => r.status === status);
  if (expiryBefore) rows = rows.filter((r) => r.endDate !== null && r.endDate <= expiryBefore);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const paged = rows.slice((page - 1) * perPage, page * perPage);

  // Same resolution order as feature-permission.ts::resolveFeatures (override → plan
  // default → disabled, fail-closed unless access-granting), inlined against batched
  // queries here instead of calling resolveFeatures() once per row.
  const pagedShopIds = paged.map((r) => r.shopId);
  const planIds = [...new Set(paged.map((r) => r.resolvedPlanId).filter((id): id is string => !!id))];

  const [allFeatures, overrides, planFeatures] = await Promise.all([
    db.feature.findMany({ where: { isActive: true } }),
    db.businessFeaturePermission.findMany({ where: { shopId: { in: pagedShopIds } } }),
    db.planFeature.findMany({ where: { planId: { in: planIds } } }),
  ]);

  const overridesByShop = new Map<string, typeof overrides>();
  for (const o of overrides) {
    if (!overridesByShop.has(o.shopId)) overridesByShop.set(o.shopId, []);
    overridesByShop.get(o.shopId)!.push(o);
  }
  const planFeaturesByPlan = new Map<string, typeof planFeatures>();
  for (const pf of planFeatures) {
    if (!planFeaturesByPlan.has(pf.planId)) planFeaturesByPlan.set(pf.planId, []);
    planFeaturesByPlan.get(pf.planId)!.push(pf);
  }

  paged.forEach((row) => {
    const enabled = new Map<string, boolean>();
    for (const feature of allFeatures) enabled.set(feature.id, false);

    if (isAccessGranting(row.status)) {
      if (row.resolvedPlanId) {
        for (const pf of planFeaturesByPlan.get(row.resolvedPlanId) ?? []) {
          enabled.set(pf.featureId, pf.enabled);
        }
      }
      for (const override of overridesByShop.get(row.shopId) ?? []) {
        enabled.set(override.featureId, override.enabled);
      }
    }

    row.enabledFeatures = allFeatures.filter((f) => enabled.get(f.id)).map((f) => f.key);
  });

  return { rows: paged, total, page, perPage, totalPages };
}
