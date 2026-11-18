import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import { ForbiddenError } from "@/lib/session";
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
  // From the effective plan — see computeDisplayStatus's "GRACE" status.
  gracePeriodDays: number;
}

type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof db.subscription.findFirst>>>;

type ResolvedPlan = { id: string; code: string; name: string; gracePeriodDays: number };

async function resolvePlanForSubscription(row: { planId: string | null; plan: string }): Promise<ResolvedPlan | null> {
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
  resolvedPlan: ResolvedPlan | null,
  now: Date
): Promise<ResolvedPlan | null> {
  if (!row.cancelAtPeriodEnd || !row.pendingPlanId || !row.endDate || now < row.endDate) {
    return resolvedPlan;
  }
  const pendingPlan = await db.plan.findUnique({ where: { id: row.pendingPlanId } });
  return pendingPlan ?? resolvedPlan;
}

function toRecord(row: SubscriptionRow, effectivePlan: ResolvedPlan | null): SubscriptionRecord {
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
    gracePeriodDays: effectivePlan?.gracePeriodDays ?? 0,
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
    gracePeriodDays: freePlan?.gracePeriodDays ?? 0,
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

/** Days left until a GRACE window itself ends; null outside of GRACE (caller should gate on displayStatus === "GRACE"). */
export function computeGraceDaysRemaining(
  displayStatus: DisplayStatus,
  gracePeriodDays: number,
  daysRemaining: number | null
): number | null {
  if (displayStatus !== "GRACE" || daysRemaining === null) return null;
  return Math.max(0, gracePeriodDays + daysRemaining);
}

// SUSPENDED/CANCELLED are terminal states set explicitly by a Super Admin
// action and never auto-derived. TRIAL/ACTIVE become EXPIRED once endDate has
// passed, computed lazily on every read — there is no background job in this
// codebase to flip status on a timer, and none is needed. GRACE is a
// transient window immediately after endDate, sized by the plan's
// gracePeriodDays — full access stays granted (see isAccessGranting) with a
// warning shown in the UI, purely to extend the "still works" period before
// the real EXPIRED lockout; nothing is feature-restricted during it.
export type DisplayStatus = "TRIAL" | "ACTIVE" | "EXPIRING_SOON" | "GRACE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";

export function computeDisplayStatus(
  sub: Pick<SubscriptionRecord, "status" | "endDate" | "gracePeriodDays">,
  now = new Date()
): DisplayStatus {
  if (sub.status === "SUSPENDED" || sub.status === "CANCELLED") return sub.status;

  const daysRemaining = computeDaysRemaining(sub.endDate, now);
  const isPastExpiry = sub.status === "EXPIRED" || (daysRemaining !== null && daysRemaining < 0);
  if (isPastExpiry) {
    const daysPastExpiry = daysRemaining !== null ? -daysRemaining : null;
    if (daysPastExpiry !== null && sub.gracePeriodDays > 0 && daysPastExpiry <= sub.gracePeriodDays) {
      return "GRACE";
    }
    return "EXPIRED";
  }
  if (daysRemaining !== null && daysRemaining <= EXPIRY_WARNING_DAYS) return "EXPIRING_SOON";
  return sub.status === "TRIAL" ? "TRIAL" : "ACTIVE";
}

/** Whether this display status should grant access to premium features at all. */
export function isAccessGranting(displayStatus: DisplayStatus): boolean {
  return (
    displayStatus === "ACTIVE" ||
    displayStatus === "TRIAL" ||
    displayStatus === "EXPIRING_SOON" ||
    displayStatus === "GRACE"
  );
}

export type SubscriptionActorType = "admin" | "staff" | "customer";

export class SubscriptionExpiredError extends ForbiddenError {
  // actorType lets handleApiError tell the client who was blocked — the
  // global subscription-purchase gate (src/components/shared/subscription-gate.tsx)
  // must only pop up for the owner ("admin"); staff can't pay for the plan,
  // and a customer must never see the shop's own billing UI.
  actorType: SubscriptionActorType;
  constructor(actorType: SubscriptionActorType = "admin", message = "Your subscription has expired. Please renew to continue.") {
    super(message);
    this.name = "SubscriptionExpiredError";
    this.actorType = actorType;
  }
}

/**
 * Account-wide gate for genuinely new paid activity (write operations) —
 * see this module's read-vs-write access model: reads always stay
 * available regardless of subscription status, only write paths call
 * through here. Re-checked live on every call, never cached — the instant
 * a renewal pushes endDate forward, access is restored with no other state
 * to flip.
 */
export async function isAccountAccessBlocked(adminId: string): Promise<boolean> {
  const subscription = await getCurrentSubscription(adminId);
  return !isAccessGranting(computeDisplayStatus(subscription));
}

/** Throws SubscriptionExpiredError (403 via the existing handleApiError) if blocked. */
export async function assertAccountAccess(adminId: string, actorType: SubscriptionActorType = "admin"): Promise<void> {
  if (await isAccountAccessBlocked(adminId)) {
    throw new SubscriptionExpiredError(actorType);
  }
}

export interface SubscriptionSummary {
  planCode: string;
  planName: string;
  status: DisplayStatus;
  startDate: Date;
  endDate: Date | null;
  daysRemaining: number | null;
  showExpiryWarning: boolean;
  // Only set when status is "GRACE" — days left until the grace window
  // itself ends and the real EXPIRED lockout begins.
  graceDaysRemaining: number | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanId: string | null;
}

/** Read-only subscription view for the business owner dashboard (no billing/history). */
export async function getSubscriptionSummaryForBusiness(adminId: string): Promise<SubscriptionSummary> {
  const sub = await getCurrentSubscription(adminId);
  const status = computeDisplayStatus(sub);
  const daysRemaining = computeDaysRemaining(sub.endDate);
  const graceDaysRemaining = computeGraceDaysRemaining(status, sub.gracePeriodDays, daysRemaining);

  return {
    planCode: sub.planCode,
    planName: sub.planName,
    status,
    startDate: sub.startDate,
    endDate: sub.endDate,
    daysRemaining,
    showExpiryWarning: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= EXPIRY_WARNING_DAYS,
    graceDaysRemaining,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pendingPlanId: sub.pendingPlanId,
  };
}
