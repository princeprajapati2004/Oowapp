import { db } from "@/lib/db";
import { SubscriptionLimitExceededError } from "@/lib/api-utils";
import { getCurrentSubscription, computeDisplayStatus, isAccessGranting } from "@/lib/services/subscription";
import type { LimitKey, Prisma } from "@/generated/prisma/client";

const LIMIT_LABELS: Record<LimitKey, string> = {
  BUSINESSES: "businesses",
  USERS: "users",
  PRODUCTS: "products",
  GODOWNS: "godowns",
  STORAGE_MB: "MB of storage",
  MONTHLY_ORDERS: "orders this month",
  CUSTOMERS: "customers",
  INVOICES: "invoices",
};

export interface UsageSnapshot {
  used: number;
  limit: number | null; // null = unlimited
}

/**
 * Live-computed usage for every limit key, across every shop the admin owns (limits are
 * account-level — a multi-business admin can't dodge a cap by spreading usage across
 * businesses). No separate usage-ledger table: these are cheap aggregate counts against
 * tables that already exist, so there's nothing to keep in sync and nothing that can
 * drift from reality.
 */
export async function getUsageSnapshot(adminId: string): Promise<Record<LimitKey, UsageSnapshot>> {
  const [subscription, shops] = await Promise.all([
    getCurrentSubscription(adminId),
    db.shop.findMany({ where: { adminId }, select: { id: true } }),
  ]);
  const shopIds = shops.map((s: (typeof shops)[number]) => s.id);

  const limitRows = subscription.resolvedPlanId
    ? await db.planLimit.findMany({ where: { planId: subscription.resolvedPlanId } })
    : [];
  const limitByKey = new Map<LimitKey, number | null>(limitRows.map((l: (typeof limitRows)[number]) => [l.limitKey, l.limitValue]));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [userCount, productCount, monthlyOrderCount, customerCount, invoiceCount] = await Promise.all([
    db.staffMember.count({ where: { shopId: { in: shopIds } } }),
    db.product.count({ where: { shopId: { in: shopIds } } }),
    db.order.count({ where: { shopId: { in: shopIds }, createdAt: { gte: monthStart } } }),
    db.customer.count({ where: { shopId: { in: shopIds } } }),
    db.order.count({ where: { shopId: { in: shopIds } } }),
  ]);

  return {
    BUSINESSES: { used: shopIds.length, limit: limitByKey.get("BUSINESSES") ?? null },
    // +1 for the owner — Admin itself always counts as the account's first "user".
    USERS: { used: userCount + 1, limit: limitByKey.get("USERS") ?? null },
    PRODUCTS: { used: productCount, limit: limitByKey.get("PRODUCTS") ?? null },
    // No real Godown module exists yet (locked-placeholder feature, see FeatureLock) —
    // usage is always 0 since nothing can create one.
    GODOWNS: { used: 0, limit: limitByKey.get("GODOWNS") ?? null },
    // No storage-accounting subsystem exists in this app (Cloudinary usage isn't
    // metered per-shop anywhere) — reported as 0 rather than a fabricated number.
    STORAGE_MB: { used: 0, limit: limitByKey.get("STORAGE_MB") ?? null },
    MONTHLY_ORDERS: { used: monthlyOrderCount, limit: limitByKey.get("MONTHLY_ORDERS") ?? null },
    CUSTOMERS: { used: customerCount, limit: limitByKey.get("CUSTOMERS") ?? null },
    // All-time order count — each Order is one invoice/bill.
    INVOICES: { used: invoiceCount, limit: limitByKey.get("INVOICES") ?? null },
  };
}

export interface LimitCheckResult {
  limit: number | null; // null = unlimited
  planName: string;
}

/**
 * checkSubscriptionLimit(adminId, "PRODUCTS", 1) — throws SubscriptionLimitExceededError
 * (403) if adding `requestedAmount` more would exceed the plan's limit for that key.
 * Called server-side at the top of every route that creates something plan-limited
 * (businesses, staff, products, ...) — never only hidden in the frontend.
 *
 * This is the fast, early check (runs before body parsing/validation, so a user over
 * their limit gets a clean error without wasted work). It is NOT by itself race-safe:
 * two concurrent requests can both read "9 of 10 used" and both proceed. The route
 * handler must also call assertLimitNotExceededInTx with this result's `limit`, inside
 * the same transaction as the actual row insert, to close that window.
 */
export async function checkSubscriptionLimit(
  adminId: string,
  limitKey: LimitKey,
  requestedAmount: number
): Promise<LimitCheckResult> {
  const subscription = await getCurrentSubscription(adminId);
  if (!isAccessGranting(computeDisplayStatus(subscription))) {
    throw new SubscriptionLimitExceededError("Your subscription is not active. Renew your plan to continue.");
  }

  const snapshot = await getUsageSnapshot(adminId);
  const { used, limit } = snapshot[limitKey];
  if (limit !== null && used + requestedAmount > limit) {
    throw new SubscriptionLimitExceededError(
      `${subscription.planName} allows up to ${limit} ${LIMIT_LABELS[limitKey]}. You've used ${used} of ${limit}. Upgrade your plan to add more.`
    );
  }
  return { limit, planName: subscription.planName };
}

/**
 * The authoritative, race-safe half of the limit check — call this with the `limit`
 * from checkSubscriptionLimit, inside the same db.$transaction as the row create it
 * guards, immediately before that create.
 *
 * A plain "recount inside a transaction" is NOT enough by itself: under Postgres's
 * default READ COMMITTED isolation, two concurrent transactions each run their own
 * COUNT, both see the same pre-insert number, both pass, and both commit — verified
 * empirically (6 concurrent requests against a 1-slot-remaining limit all succeeded,
 * blowing the limit from 10 to 15) before this lock was added. `pg_advisory_xact_lock`
 * keyed on adminId forces every concurrent request for the same account to actually
 * queue behind each other for the duration of this transaction, so the recount a
 * second request sees always reflects the first request's already-committed insert.
 * The lock auto-releases at commit/rollback — no explicit unlock needed.
 *
 * Postgres-only (this app's live/deployed provider per .env and README). The MySQL
 * provider path this codebase also supports (db-provider.ts) has no equivalent guard
 * here — GET_LOCK()/RELEASE_LOCK() would be needed if that provider is ever actually
 * used in production; flagged rather than silently assumed safe.
 *
 * `countInTx` must run on `tx` (not the global `db`) and count the same rows
 * getUsageSnapshot would.
 */
export async function assertLimitNotExceededInTx(
  tx: Prisma.TransactionClient,
  adminId: string,
  limitKey: LimitKey,
  limit: number | null,
  planName: string,
  requestedAmount: number,
  countInTx: (tx: Prisma.TransactionClient) => Promise<number>
): Promise<void> {
  if (limit === null) return; // unlimited
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${adminId}))`;
  const used = await countInTx(tx);
  if (used + requestedAmount > limit) {
    throw new SubscriptionLimitExceededError(
      `${planName} allows up to ${limit} ${LIMIT_LABELS[limitKey]}. You've used ${used} of ${limit}. Upgrade your plan to add more.`
    );
  }
}
