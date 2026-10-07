import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import { NotFoundError } from "@/lib/api-utils";
import type { SubscriptionDuration, SubscriptionPlan as LegacyPlanEnum } from "@/generated/prisma/client";
import {
  getCurrentSubscription,
  getLatestSubscriptionsByAdminIds,
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
//
// Every function here is called with a shopId (the Super Admin UI navigates "by
// business," URL param included) but resolves and mutates by the owning adminId
// internally — Subscription is account-level (one plan covers every shop an admin
// owns), so changing "a shop's" plan here really changes the whole account's plan.
// siblingShopCount (returned by resolveShopAndAdmin/getSubscriptionDetailForSuperAdmin)
// is how the UI surfaces "this affects N businesses" instead of silently doing it.

async function resolveShopAndAdmin(shopId: string): Promise<{ adminId: string; businessName: string; siblingShopCount: number }> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { adminId: true, businessName: true } });
  if (!shop) throw new NotFoundError("Business not found");
  const siblingShopCount = await db.shop.count({ where: { adminId: shop.adminId } });
  return { adminId: shop.adminId, businessName: shop.businessName, siblingShopCount };
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
  const { adminId } = await resolveShopAndAdmin(shopId);
  const plan = await resolvePlanByCode(opts.planCode);
  const startDate = new Date();
  const endDate = resolveEndDate(startDate, opts.duration, opts.endDate);

  return db.subscription.create({
    data: {
      adminId,
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
  const { adminId } = await resolveShopAndAdmin(shopId);
  const current = await getCurrentSubscription(adminId);
  const startDate = new Date();
  const endDate = resolveEndDate(startDate, opts.duration, opts.endDate);

  return db.subscription.create({
    data: {
      adminId,
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
  const { adminId } = await resolveShopAndAdmin(shopId);
  const current = await getCurrentSubscription(adminId);
  const base = current.endDate && current.endDate > new Date() ? current.endDate : new Date();
  const endDate = resolveEndDate(base, opts.duration, opts.endDate);

  return db.subscription.create({
    data: {
      adminId,
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
  const { adminId } = await resolveShopAndAdmin(shopId);
  const current = await getCurrentSubscription(adminId);
  const plan = await resolvePlanByCode(opts.planCode);

  return db.subscription.create({
    data: {
      adminId,
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
  const { adminId } = await resolveShopAndAdmin(shopId);
  const current = await getCurrentSubscription(adminId);

  return db.subscription.create({
    data: {
      adminId,
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
  const { adminId } = await resolveShopAndAdmin(shopId);
  const current = await getCurrentSubscription(adminId);
  if (current.status !== "SUSPENDED") {
    throw new Error("Subscription is not currently suspended.");
  }

  return db.subscription.create({
    data: {
      adminId,
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
  const { adminId } = await resolveShopAndAdmin(shopId);
  const current = await getCurrentSubscription(adminId);

  return db.subscription.create({
    data: {
      adminId,
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
  const { adminId, siblingShopCount } = await resolveShopAndAdmin(shopId);
  const [current, historyRows] = await Promise.all([
    getCurrentSubscription(adminId),
    db.subscription.findMany({
      where: { adminId },
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
    siblingShopCount,
    history: historyRows.map((row: (typeof historyRows)[number]) => ({
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
              { businessName: { contains: search, ...caseInsensitive() } },
              { slug: { contains: search, ...caseInsensitive() } },
              { admin: { email: { contains: search, ...caseInsensitive() } } },
            ],
          }
        : {}),
      ...(businessType ? { businessType: businessType as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { admin: { select: { email: true } } },
  });

  // Subscription is account-level — resolve once per admin, not once per shop, so two
  // businesses under the same account correctly show the same plan (see
  // getLatestSubscriptionsByAdminIds's doc comment for why this replaced an earlier,
  // independent shopId-keyed inline resolution here).
  const adminIds = [...new Set<string>(shops.map((s: (typeof shops)[number]) => s.adminId))];
  const subscriptionByAdmin = await getLatestSubscriptionsByAdminIds(adminIds);

  let rows = shops.map((shop: (typeof shops)[number]) => {
    const sub = subscriptionByAdmin.get(shop.adminId);
    const startDate = sub?.startDate ?? shop.createdAt;
    const endDate = sub?.endDate ?? addDurationDays(startDate, DEFAULT_TRIAL_DURATION);
    const record = { status: sub?.status ?? ("TRIAL" as const), endDate };

    return {
      shopId: shop.id,
      adminId: shop.adminId,
      slug: shop.slug,
      logoUrl: shop.logoUrl,
      businessName: shop.businessName,
      ownerName: shop.ownerName,
      businessType: shop.businessType as string,
      phone: shop.phone,
      email: shop.admin.email,
      resolvedPlanId: sub?.resolvedPlanId ?? null,
      planCode: sub?.planCode ?? "FREE",
      planName: sub?.planName ?? "Free",
      status: computeDisplayStatus(record),
      accountStatus: shop.status as string,
      startDate,
      endDate,
      daysRemaining: computeDaysRemaining(endDate),
      enabledFeatures: [] as string[],
    };
  });

  if (planCode) rows = rows.filter((r: (typeof rows)[number]) => r.planCode === planCode);
  if (status) rows = rows.filter((r: (typeof rows)[number]) => r.status === status);
  if (expiryBefore) rows = rows.filter((r: (typeof rows)[number]) => r.endDate !== null && r.endDate <= expiryBefore);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const paged = rows.slice((page - 1) * perPage, page * perPage);

  // Same resolution order as feature-permission.ts::resolveFeatures (override → plan
  // default → disabled, fail-closed unless access-granting), inlined against batched
  // queries here instead of calling resolveFeatures() once per row.
  const pagedShopIds = paged.map((r: (typeof paged)[number]) => r.shopId);
  const planIds = [...new Set(paged.map((r: (typeof paged)[number]) => r.resolvedPlanId).filter((id: string | null): id is string => !!id))];

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

  paged.forEach((row: (typeof paged)[number]) => {
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

    row.enabledFeatures = allFeatures.filter((f: (typeof allFeatures)[number]) => enabled.get(f.id)).map((f: (typeof allFeatures)[number]) => f.key);
  });

  return { rows: paged, total, page, perPage, totalPages };
}
