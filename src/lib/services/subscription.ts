import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { SubscriptionStatus, SubscriptionDuration, BillingCycle } from "@/generated/prisma/client";

const DURATION_DAYS: Record<SubscriptionDuration, number> = {
  FIFTEEN_DAYS: 15,
  ONE_MONTH: 30,
  THREE_MONTHS: 90,
  SIX_MONTHS: 180,
  TWELVE_MONTHS: 365,
  // CUSTOM has no fixed length — the caller (Phase 2 create/renew/extend flow)
  // supplies an explicit endDate instead of calling addDurationDays.
  CUSTOM: 0,
};

export const DEFAULT_TRIAL_DURATION: SubscriptionDuration = "FIFTEEN_DAYS";
const EXPIRY_WARNING_DAYS = 7;

export function addDurationDays(startDate: Date, duration: SubscriptionDuration): Date {
  const end = new Date(startDate);
  end.setDate(end.getDate() + DURATION_DAYS[duration]);
  return end;
}

export interface SubscriptionRecord {
  id: string | null; // null when this is a virtual (non-persisted) fallback
  adminId: string;
  resolvedPlanId: string | null; // Plan.id, resolved via planId FK or legacy-code fallback
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  duration: SubscriptionDuration;
  startDate: Date;
  endDate: Date | null;
  createdBy: string | null;
  remarks: string | null;
  createdAt: Date;
  // Scheduled-downgrade intent, surfaced as-is (never silently consumed) so the owner UI
  // can show "switching to X on <date>" — resolvedPlanId/planCode/planName above already
  // reflect the *effective* plan (i.e. the pending plan once endDate has passed).
  cancelAtPeriodEnd: boolean;
  pendingPlanId: string | null;
  pendingBillingCycle: BillingCycle | null;
}

type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof db.subscription.findFirst>>>;

async function resolvePlanForSubscription(row: { planId: string | null; plan: string }): Promise<{ id: string; code: string; name: string } | null> {
  if (row.planId) {
    const plan = await db.plan.findUnique({ where: { id: row.planId } });
    if (plan) return plan;
  }
  // Bridge fallback for rows created before planId existed, or where the FK plan
  // was removed — resolve by the legacy enum code instead (see
  // SUBSCRIPTION_POS_ARCHITECTURE.md, Decision A).
  return db.plan.findUnique({ where: { code: row.plan } });
}

/**
 * Pure derivation, zero writes, ever — if a downgrade was scheduled
 * (cancelAtPeriodEnd) and the period has actually ended, the *effective*
 * plan for every caller (feature resolution, limit checks, the owner's
 * billing page) is the pending plan, from the moment endDate passes. A real
 * new Subscription row only gets written the next time some other genuine
 * mutation happens (a renewal/upgrade/SA action) — see subscription-billing.ts.
 */
async function applyPendingDowngrade(
  row: Pick<SubscriptionRow, "cancelAtPeriodEnd" | "pendingPlanId" | "endDate">,
  resolvedPlan: { id: string; code: string; name: string } | null,
  now: Date
): Promise<{ id: string; code: string; name: string } | null> {
  if (!row.cancelAtPeriodEnd || !row.pendingPlanId || !row.endDate || now < row.endDate) {
    return resolvedPlan;
  }
  const pendingPlan = await db.plan.findUnique({ where: { id: row.pendingPlanId } });
  return pendingPlan ?? resolvedPlan;
}

function toRecord(row: SubscriptionRow, effectivePlan: { id: string; code: string; name: string } | null): SubscriptionRecord {
  return {
    id: row.id,
    adminId: row.adminId ?? "",
    resolvedPlanId: effectivePlan?.id ?? null,
    planCode: effectivePlan?.code ?? row.plan,
    planName: effectivePlan?.name ?? row.plan,
    status: row.status,
    duration: row.duration,
    startDate: row.startDate,
    endDate: row.endDate,
    createdBy: row.createdBy,
    remarks: row.remarks,
    createdAt: row.createdAt,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    pendingPlanId: row.pendingPlanId,
    pendingBillingCycle: row.pendingBillingCycle,
  };
}

/** Resolve the owning adminId for a shop — used by callers that only have a shopId
 * (e.g. feature-permission.ts resolving a per-shop nav/route check) but must key
 * subscription/billing lookups by the account, not the business. */
export async function resolveAdminIdForShop(shopId: string): Promise<string> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { adminId: true } });
  if (!shop) throw new NotFoundError("Business not found");
  return shop.adminId;
}

/**
 * Every new admin account gets a Subscription row at signup (see createInitialSubscription,
 * called from src/app/api/auth/complete-registration/route.ts). This only returns a virtual,
 * non-persisted default for admins that predate that hook — a read path must never mutate
 * data as a side effect, so nothing is written here.
 *
 * Keyed by adminId — authoritative as of multi-business support (one plan covers every
 * shop an admin owns). The multi-business migration already backfilled adminId onto every
 * pre-existing row, so no shopId fallback is needed here.
 */
export async function getCurrentSubscription(adminId: string): Promise<SubscriptionRecord> {
  const row = await db.subscription.findFirst({
    where: { adminId },
    orderBy: { createdAt: "desc" },
  });

  if (row) {
    const plan = await resolvePlanForSubscription(row);
    const effectivePlan = await applyPendingDowngrade(row, plan, new Date());
    return toRecord(row, effectivePlan);
  }

  const admin = await db.admin.findUnique({ where: { id: adminId }, select: { createdAt: true } });
  const startDate = admin?.createdAt ?? new Date();
  const freePlan = await db.plan.findUnique({ where: { code: "FREE" } });
  return {
    id: null,
    adminId,
    resolvedPlanId: freePlan?.id ?? null,
    planCode: "FREE",
    planName: freePlan?.name ?? "Free",
    status: "TRIAL",
    duration: DEFAULT_TRIAL_DURATION,
    startDate,
    endDate: addDurationDays(startDate, DEFAULT_TRIAL_DURATION),
    createdBy: null,
    remarks: null,
    createdAt: startDate,
    cancelAtPeriodEnd: false,
    pendingPlanId: null,
    pendingBillingCycle: null,
  };
}

/**
 * Batched "latest Subscription per admin" for list views that show many businesses at
 * once (Super Admin Businesses list, Super Admin Subscriptions list) — avoids an N+1 of
 * getCurrentSubscription() calls, one shared implementation instead of each view
 * inlining its own resolution. Admins with zero Subscription rows (pre-signup-hook
 * stragglers, if any) are simply absent from the returned Map; callers should fall back
 * to a virtual FREE/TRIAL display the same way getCurrentSubscription does, keyed off
 * whatever admin/shop data they already have loaded.
 */
export async function getLatestSubscriptionsByAdminIds(adminIds: string[]): Promise<Map<string, SubscriptionRecord>> {
  if (adminIds.length === 0) return new Map();

  const [rows, plans] = await Promise.all([
    db.subscription.findMany({
      where: { adminId: { in: adminIds } },
      orderBy: { createdAt: "desc" },
    }),
    db.plan.findMany(),
  ]);

  const planById = new Map<string, (typeof plans)[number]>(plans.map((p: (typeof plans)[number]) => [p.id, p]));
  const planByCode = new Map<string, (typeof plans)[number]>(plans.map((p: (typeof plans)[number]) => [p.code, p]));
  const now = new Date();

  const result = new Map<string, SubscriptionRecord>();
  for (const row of rows) {
    if (!row.adminId || result.has(row.adminId)) continue; // keep only the latest (first) per admin
    const plan = (row.planId ? planById.get(row.planId) : undefined) ?? planByCode.get(row.plan) ?? null;
    const effectivePlan = await applyPendingDowngrade(row, plan, now);
    result.set(row.adminId, toRecord(row, effectivePlan));
  }
  return result;
}

/**
 * Creates the initial trial Subscription row for a newly signed-up admin. Billing is
 * account-level (adminId) as of multi-business support — new rows never set shopId
 * (legacy, read-only going forward).
 */
export async function createInitialSubscription(adminId: string) {
  const freePlan = await db.plan.findUnique({ where: { code: "FREE" } });
  const startDate = new Date();
  return db.subscription.create({
    data: {
      adminId,
      plan: "FREE",
      planId: freePlan?.id,
      status: "TRIAL",
      duration: DEFAULT_TRIAL_DURATION,
      action: "CREATED",
      startDate,
      endDate: addDurationDays(startDate, DEFAULT_TRIAL_DURATION),
      createdBy: "system",
      remarks: "Auto-created trial on signup.",
    },
  });
}

export function computeDaysRemaining(endDate: Date | null, now = new Date()): number | null {
  if (!endDate) return null;
  return Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// The 5 statuses the spec asks for. SUSPENDED/CANCELLED are terminal states set
// explicitly by a Super Admin action and never auto-derived. TRIAL/ACTIVE become
// EXPIRED once endDate has passed, computed lazily on every read — there is no
// background job in this codebase to flip status on a timer, and none is needed.
export type DisplayStatus = "TRIAL" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED" | "CANCELLED";

export function computeDisplayStatus(
  sub: Pick<SubscriptionRecord, "status" | "endDate">,
  now = new Date()
): DisplayStatus {
  if (sub.status === "SUSPENDED" || sub.status === "CANCELLED") return sub.status;

  const daysRemaining = computeDaysRemaining(sub.endDate, now);
  if (sub.status === "EXPIRED" || (daysRemaining !== null && daysRemaining < 0)) return "EXPIRED";
  if (daysRemaining !== null && daysRemaining <= EXPIRY_WARNING_DAYS) return "EXPIRING_SOON";
  return sub.status === "TRIAL" ? "TRIAL" : "ACTIVE";
}

/** Whether this display status should grant access to premium features at all. */
export function isAccessGranting(displayStatus: DisplayStatus): boolean {
  return displayStatus === "ACTIVE" || displayStatus === "TRIAL" || displayStatus === "EXPIRING_SOON";
}

export interface SubscriptionSummary {
  planCode: string;
  planName: string;
  status: DisplayStatus;
  startDate: Date;
  endDate: Date | null;
  daysRemaining: number | null;
  showExpiryWarning: boolean;
  cancelAtPeriodEnd: boolean;
  pendingPlanId: string | null;
}

/** Read-only subscription view for the business owner dashboard (no billing/history). */
export async function getSubscriptionSummaryForBusiness(adminId: string): Promise<SubscriptionSummary> {
  const sub = await getCurrentSubscription(adminId);
  const status = computeDisplayStatus(sub);
  const daysRemaining = computeDaysRemaining(sub.endDate);

  return {
    planCode: sub.planCode,
    planName: sub.planName,
    status,
    startDate: sub.startDate,
    endDate: sub.endDate,
    daysRemaining,
    showExpiryWarning: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= EXPIRY_WARNING_DAYS,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pendingPlanId: sub.pendingPlanId,
  };
}
