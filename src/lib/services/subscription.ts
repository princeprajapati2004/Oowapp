import { db } from "@/lib/db";
import type { SubscriptionStatus, SubscriptionDuration } from "@/generated/prisma/client";

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
  shopId: string;
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
}

async function resolvePlanForSubscription(row: {
  planId: string | null;
  plan: string;
}): Promise<{ id: string; code: string; name: string } | null> {
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
 * Every new shop gets a Subscription row at signup (see createInitialSubscription,
 * called from src/app/api/auth/signup/route.ts). This only returns a virtual,
 * non-persisted default for shops that predate that hook — a read path must never
 * mutate data as a side effect, so nothing is written here.
 */
export async function getCurrentSubscription(shopId: string): Promise<SubscriptionRecord> {
  const row = await db.subscription.findFirst({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });

  if (row) {
    const plan = await resolvePlanForSubscription(row);
    return {
      id: row.id,
      shopId: row.shopId,
      resolvedPlanId: plan?.id ?? null,
      planCode: plan?.code ?? row.plan,
      planName: plan?.name ?? row.plan,
      status: row.status,
      duration: row.duration,
      startDate: row.startDate,
      endDate: row.endDate,
      createdBy: row.createdBy,
      remarks: row.remarks,
      createdAt: row.createdAt,
    };
  }

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { createdAt: true } });
  const startDate = shop?.createdAt ?? new Date();
  const freePlan = await db.plan.findUnique({ where: { code: "FREE" } });
  return {
    id: null,
    shopId,
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
  };
}

/** Creates the initial trial Subscription row for a newly signed-up shop. */
export async function createInitialSubscription(shopId: string) {
  const freePlan = await db.plan.findUnique({ where: { code: "FREE" } });
  const startDate = new Date();
  return db.subscription.create({
    data: {
      shopId,
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
}

/** Read-only subscription view for the business owner dashboard (no billing/history). */
export async function getSubscriptionSummaryForBusiness(shopId: string): Promise<SubscriptionSummary> {
  const sub = await getCurrentSubscription(shopId);
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
  };
}
