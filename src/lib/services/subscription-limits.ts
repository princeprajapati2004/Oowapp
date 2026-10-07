import { db } from "@/lib/db";
import { SubscriptionLimitExceededError } from "@/lib/api-utils";
import { getCurrentSubscription, computeDisplayStatus, isAccessGranting } from "@/lib/services/subscription";
import type { LimitKey } from "@/generated/prisma/client";

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

/**
 * checkSubscriptionLimit(adminId, "PRODUCTS", 1) — throws SubscriptionLimitExceededError
 * (403) if adding `requestedAmount` more would exceed the plan's limit for that key.
 * Called server-side at the top of every route that creates something plan-limited
 * (businesses, staff, products, ...) — never only hidden in the frontend.
 */
export async function checkSubscriptionLimit(adminId: string, limitKey: LimitKey, requestedAmount: number): Promise<void> {
  const subscription = await getCurrentSubscription(adminId);
  if (!isAccessGranting(computeDisplayStatus(subscription))) {
    throw new SubscriptionLimitExceededError("Your subscription is not active. Renew your plan to continue.");
  }

  const snapshot = await getUsageSnapshot(adminId);
  const { used, limit } = snapshot[limitKey];
  if (limit === null) return; // unlimited

  if (used + requestedAmount > limit) {
    throw new SubscriptionLimitExceededError(
      `${subscription.planName} allows up to ${limit} ${LIMIT_LABELS[limitKey]}. You've used ${used} of ${limit}. Upgrade your plan to add more.`
    );
  }
}
