import { db } from "@/lib/db";
import { getUsageSnapshot } from "@/lib/services/subscription-limits";
import { getCurrentSubscription } from "@/lib/services/subscription";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Append-only event log behind the Usage History page — one row per
 * successful feature-consuming action. Never call this for a failed
 * operation or an idempotent replay (e.g. a duplicate clientRequestId) —
 * the caller decides that, this function just records what it's told.
 * Swallows its own errors (logged, never thrown) since a usage-log write
 * must never fail the real business operation that already succeeded.
 */
export async function recordFeatureUsage(opts: {
  shopId: string;
  adminId: string;
  featureKey: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  actorType: "admin" | "staff" | "customer";
  actorId: string;
  relatedRecordId?: string;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  try {
    const client = opts.tx ?? db;
    const sub = await getCurrentSubscription(opts.adminId);
    await client.subscriptionUsageRecord.create({
      data: {
        shopId: opts.shopId,
        adminId: opts.adminId,
        subscriptionId: sub.id,
        planId: sub.resolvedPlanId,
        featureKey: opts.featureKey,
        action: opts.action,
        actorType: opts.actorType,
        actorId: opts.actorId,
        relatedRecordId: opts.relatedRecordId ?? null,
      },
    });
  } catch (err) {
    console.error(`recordFeatureUsage failed (featureKey=${opts.featureKey}, adminId=${opts.adminId}):`, err);
  }
}

export interface UsageHistoryFilter {
  from?: Date;
  to?: Date;
  featureKey?: string;
}

/** Owner-facing event list — survives plan expiry and renewal, never trimmed by either. */
export async function getUsageHistory(adminId: string, filter: UsageHistoryFilter = {}) {
  return db.subscriptionUsageRecord.findMany({
    where: {
      adminId,
      featureKey: filter.featureKey,
      createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    },
    include: { shop: { select: { businessName: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/** Per-feature event counts for the same window — the Usage History page's summary row. */
export async function getUsageSummaryByFeature(adminId: string, filter: UsageHistoryFilter = {}): Promise<Record<string, number>> {
  const rows = await db.subscriptionUsageRecord.groupBy({
    by: ["featureKey"],
    where: {
      adminId,
      featureKey: filter.featureKey,
      createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r: (typeof rows)[number]) => [r.featureKey, r._count._all]));
}

/**
 * The current and immediately-previous Subscription row's date range, for
 * the Usage History page's "Current Billing Period" / "Previous Billing
 * Period" filter options. Each row is one fixed period (renewals always
 * create a new row — see subscription-billing.ts), so the two latest rows
 * by createdAt are exactly "current" and "previous."
 */
export async function getBillingPeriodRange(
  adminId: string,
  which: "current" | "previous"
): Promise<{ from: Date; to: Date | null } | null> {
  const rows = await db.subscription.findMany({
    where: { adminId },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { startDate: true, endDate: true },
  });
  const target = which === "current" ? rows[0] : rows[1];
  return target ? { from: target.startDate, to: target.endDate } : null;
}

/** Current-period remaining usage vs. plan limits — see subscription-limits.ts::getUsageSnapshot. */
export const getRemainingPlanUsage = getUsageSnapshot;
