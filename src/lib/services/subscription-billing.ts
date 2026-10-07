import { db } from "@/lib/db";
import { getCurrentSubscription } from "@/lib/services/subscription";
import type { BillingCycle, SubscriptionDuration, Prisma } from "@/generated/prisma/client";

function billingCycleToDuration(cycle: BillingCycle): SubscriptionDuration {
  return cycle === "ANNUAL" ? "TWELVE_MONTHS" : "ONE_MONTH";
}

function addByDuration(start: Date, duration: SubscriptionDuration): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + (duration === "TWELVE_MONTHS" ? 365 : 30));
  return end;
}

/** Derived from the transaction's own (already-unique) id — human-scannable, zero new
 * infrastructure, and no race condition to reason about (unlike a shared sequence
 * counter would need). Not a GST-compliance sequential invoice number — this is
 * OOWAPP's own subscription receipt, not the shop's customer-facing invoice. */
function buildInvoiceNumber(transactionId: string, now: Date): string {
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `SUB-${yearMonth}-${transactionId.slice(-8).toUpperCase()}`;
}

/**
 * Activates a subscription from a verified payment — idempotent against both a
 * verify-route/webhook race and a client double-submit of the verify step, via
 * SubscriptionTransaction.activatedSubscriptionId (checked first; if already set,
 * the existing Subscription row is returned instead of creating a second one).
 *
 * Deliberately NOT built on subscription-admin.ts's changePlan/createSubscription —
 * those never touch dates (fine for an SA re-categorization, wrong for a paid upgrade,
 * which must start/extend a real billing period), have no idempotency guard of their
 * own, and their createdBy carries no actor-type distinction from a manual SA grant.
 *
 * No proration: changing plans starts a fresh period at the new price from now;
 * renewing the same plan extends from the later of now/the current endDate.
 */
export async function activateSubscriptionFromPayment(opts: {
  adminId: string;
  planId: string;
  billingCycle: BillingCycle;
  transactionId: string;
  gatewayPaymentId: string;
}) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existingTxn = await tx.subscriptionTransaction.findUnique({ where: { id: opts.transactionId } });
    if (!existingTxn) throw new Error("Transaction not found.");

    if (existingTxn.activatedSubscriptionId) {
      const existing = await tx.subscription.findUnique({ where: { id: existingTxn.activatedSubscriptionId } });
      if (existing) return { subscription: existing, alreadyActivated: true as const };
    }

    const current = await getCurrentSubscription(opts.adminId);
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: opts.planId } });
    const duration = billingCycleToDuration(opts.billingCycle);
    const now = new Date();

    const samePlan = current.resolvedPlanId === opts.planId;
    const startDate = samePlan ? current.startDate : now;
    const periodBase = samePlan && current.endDate && current.endDate > now ? current.endDate : now;
    const endDate = addByDuration(periodBase, duration);

    const subscription = await tx.subscription.create({
      data: {
        adminId: opts.adminId,
        plan: "FREE", // legacy bridge column — MOON_STAR/SUPER_STAR have no legacy enum equivalent (see legacyPlanColumnValue); planId below is authoritative
        planId: plan.id,
        status: "ACTIVE",
        duration,
        action: samePlan ? "RENEWED" : "PLAN_CHANGED",
        startDate,
        endDate,
        createdBy: `payment:${opts.transactionId}`,
        remarks: `Self-service ${opts.billingCycle.toLowerCase()} ${samePlan ? "renewal" : "plan change"} via Razorpay.`,
      },
    });

    const invoiceNumber = buildInvoiceNumber(opts.transactionId, now);
    await tx.subscriptionTransaction.update({
      where: { id: opts.transactionId },
      data: {
        status: "SUCCESS",
        activatedSubscriptionId: subscription.id,
        gatewayPaymentId: opts.gatewayPaymentId,
        invoiceNumber,
        paidAt: now,
      },
    });

    if (existingTxn.couponId) {
      await tx.subscriptionCoupon.update({ where: { id: existingTxn.couponId }, data: { usageCount: { increment: 1 } } });
      await tx.subscriptionCouponRedemption.create({
        data: {
          couponId: existingTxn.couponId,
          adminId: opts.adminId,
          transactionId: opts.transactionId,
          discountAmount: existingTxn.discountAmount,
        },
      });
    }

    return { subscription, alreadyActivated: false as const };
  });
}

/**
 * Owner schedules a downgrade — never applied immediately or by deleting data. If
 * current usage already fits the target plan's limits, scheduling still only takes
 * effect at the end of the current billing period (consistent, predictable behavior
 * regardless of whether usage happens to fit today). Pure intent-recording: a new
 * Subscription row is written now (action: DOWNGRADE_SCHEDULED) but its plan/dates are
 * unchanged — only cancelAtPeriodEnd/pendingPlanId/pendingBillingCycle differ. The
 * actual plan switch is derived lazily by getCurrentSubscription() once endDate
 * passes — see subscription.ts's applyPendingDowngrade.
 */
export async function scheduleDowngrade(adminId: string, opts: { pendingPlanId: string; pendingBillingCycle: BillingCycle; createdBy: string }) {
  const current = await getCurrentSubscription(adminId);
  return db.subscription.create({
    data: {
      adminId,
      plan: "FREE",
      planId: current.resolvedPlanId,
      status: current.status,
      duration: current.duration,
      action: "DOWNGRADE_SCHEDULED",
      startDate: current.startDate,
      endDate: current.endDate,
      cancelAtPeriodEnd: true,
      pendingPlanId: opts.pendingPlanId,
      pendingBillingCycle: opts.pendingBillingCycle,
      createdBy: opts.createdBy,
      remarks: "Downgrade scheduled for end of current billing period.",
    },
  });
}

export async function cancelScheduledDowngrade(adminId: string, opts: { createdBy: string }) {
  const current = await getCurrentSubscription(adminId);
  return db.subscription.create({
    data: {
      adminId,
      plan: "FREE",
      planId: current.resolvedPlanId,
      status: current.status,
      duration: current.duration,
      action: "PLAN_CHANGED",
      startDate: current.startDate,
      endDate: current.endDate,
      cancelAtPeriodEnd: false,
      pendingPlanId: null,
      pendingBillingCycle: null,
      createdBy: opts.createdBy,
      remarks: "Scheduled downgrade cancelled.",
    },
  });
}
