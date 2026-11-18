import { db } from "@/lib/db";
import { NotFoundError, TermsNotAcceptedError } from "@/lib/api-utils";
import { ForbiddenError } from "@/lib/session";
import {
  createRazorpayPlan,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
  verifyPaymentSignature,
} from "@/lib/services/razorpay";
import { priceForCycle } from "@/lib/services/subscription-checkout";
import { getSubscriptionTaxConfig, calculateTax } from "@/lib/services/subscription-tax";
import { activateSubscriptionFromPayment } from "@/lib/services/subscription-billing";
import { hasAcceptedCurrentTerms } from "@/lib/services/subscription-terms";
import type { BillingCycle } from "@/generated/prisma/client";

// "Effectively indefinite" cycle counts — Razorpay requires a finite
// total_count (no literal "forever" option). Comfortably outlives any real
// subscriber; a fresh mandate can always be set up again if one ever
// actually runs out.
const TOTAL_CYCLES: Record<BillingCycle, number> = {
  MONTHLY: 120, // 10 years
  ANNUAL: 20, // 20 years
};

function razorpayPeriodFor(cycle: BillingCycle): { period: "monthly" | "yearly"; interval: number } {
  return cycle === "ANNUAL" ? { period: "yearly", interval: 1 } : { period: "monthly", interval: 1 };
}

export interface AutoPaySetupResult {
  mandateId: string;
  razorpaySubscriptionId: string;
  razorpayKeyId: string;
  totalAmount: number;
  currency: string;
}

/**
 * Creates the Razorpay-side Plan + Subscription objects and our own
 * CREATED-status mandate + INITIATED transaction row — mirrors
 * subscription-checkout.ts::createCheckoutOrder's shape so the client-side
 * flow (open Razorpay Checkout, verify) is the same pattern with
 * `subscription_id` in place of `order_id`. No coupon support here (kept
 * out deliberately — a coupon discount would need to be "honored" forever
 * by an immutable Razorpay Plan amount, which doesn't fit a one-time code).
 */
export async function setupAutoPay(adminId: string, opts: { planId: string; billingCycle: BillingCycle }): Promise<AutoPaySetupResult> {
  const plan = await db.plan.findUnique({ where: { id: opts.planId } });
  if (!plan || !plan.isActive || plan.isArchived) throw new NotFoundError("This plan is not available for checkout.");

  const baseAmount = priceForCycle(plan, opts.billingCycle);
  if (baseAmount === null) {
    throw new NotFoundError(`${plan.name} does not have a self-service ${opts.billingCycle.toLowerCase()} price — contact sales.`);
  }

  if (!(await hasAcceptedCurrentTerms(adminId, plan.id))) {
    throw new TermsNotAcceptedError(`Please review and accept ${plan.name}'s terms before continuing.`);
  }

  const taxConfig = await getSubscriptionTaxConfig();
  const tax = calculateTax(baseAmount, taxConfig);
  const { period, interval } = razorpayPeriodFor(opts.billingCycle);

  const razorpayPlan = await createRazorpayPlan({
    name: `${plan.name} (${opts.billingCycle === "ANNUAL" ? "Annual" : "Monthly"} auto-pay)`,
    amountPaise: Math.round(tax.totalAmount * 100),
    currency: plan.currency,
    period,
    interval,
    notes: { adminId, planCode: plan.code, billingCycle: opts.billingCycle },
  });

  const razorpaySubscription = await createRazorpaySubscription({
    razorpayPlanId: razorpayPlan.id,
    totalCount: TOTAL_CYCLES[opts.billingCycle],
    notes: { adminId, planCode: plan.code, billingCycle: opts.billingCycle },
  });

  const mandate = await db.subscriptionAutoPayMandate.create({
    data: {
      adminId,
      planId: plan.id,
      billingCycle: opts.billingCycle,
      razorpayPlanId: razorpayPlan.id,
      razorpaySubscriptionId: razorpaySubscription.id,
      status: "CREATED",
    },
  });

  await db.subscriptionTransaction.create({
    data: {
      adminId,
      planId: plan.id,
      billingCycle: opts.billingCycle,
      baseAmount,
      discountAmount: 0,
      taxAmount: tax.taxAmount,
      totalAmount: tax.totalAmount,
      currency: plan.currency,
      status: "INITIATED",
      autoPayMandateId: mandate.id,
    },
  });

  return {
    mandateId: mandate.id,
    razorpaySubscriptionId: razorpaySubscription.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    totalAmount: tax.totalAmount,
    currency: plan.currency,
  };
}

/** Server-side-verified activation of the FIRST cycle — same "never trust the
 * client" rule as the one-time flow. Every later cycle only ever arrives via
 * the subscription.charged webhook (see recordRecurringCharge), since no
 * customer is present to drive a client-side verify call for those. */
export async function verifyAutoPaySetup(
  adminId: string,
  opts: { mandateId: string; razorpayPaymentId: string; razorpaySignature: string }
) {
  const mandate = await db.subscriptionAutoPayMandate.findUnique({ where: { id: opts.mandateId } });
  if (!mandate) throw new NotFoundError("Auto-pay setup not found.");
  if (mandate.adminId !== adminId) throw new ForbiddenError("This auto-pay setup does not belong to your account.");

  verifyPaymentSignature({
    subscriptionId: mandate.razorpaySubscriptionId,
    paymentId: opts.razorpayPaymentId,
    signature: opts.razorpaySignature,
  });

  const transaction = await db.subscriptionTransaction.findFirst({
    where: { autoPayMandateId: mandate.id, status: "INITIATED" },
    orderBy: { createdAt: "desc" },
  });
  if (!transaction) throw new NotFoundError("Auto-pay transaction not found.");

  await db.subscriptionAutoPayMandate.update({ where: { id: mandate.id }, data: { status: "ACTIVE" } });

  return activateSubscriptionFromPayment({
    adminId,
    planId: mandate.planId,
    billingCycle: mandate.billingCycle,
    transactionId: transaction.id,
    gatewayPaymentId: opts.razorpayPaymentId,
  });
}

/**
 * The ONLY path for every cycle after the first — triggered by Razorpay's
 * subscription.charged webhook, not by anything the customer does. Idempotent
 * on gatewayPaymentId's uniqueness (same convention as the one-time flow's
 * webhook backup): a retried/duplicate delivery of the same charge is a
 * silent no-op, never a second renewal.
 */
export async function recordRecurringCharge(opts: {
  razorpaySubscriptionId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  currency: string;
}) {
  const existing = await db.subscriptionTransaction.findUnique({ where: { gatewayPaymentId: opts.razorpayPaymentId } });
  if (existing) return { alreadyProcessed: true as const };

  const mandate = await db.subscriptionAutoPayMandate.findUnique({ where: { razorpaySubscriptionId: opts.razorpaySubscriptionId } });
  if (!mandate) return { alreadyProcessed: false as const, mandateNotFound: true as const };

  const totalAmount = opts.amountPaise / 100;
  const transaction = await db.subscriptionTransaction.create({
    data: {
      adminId: mandate.adminId,
      planId: mandate.planId,
      billingCycle: mandate.billingCycle,
      baseAmount: totalAmount,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount,
      currency: opts.currency,
      status: "INITIATED",
      autoPayMandateId: mandate.id,
    },
  });

  if (mandate.status !== "ACTIVE") {
    await db.subscriptionAutoPayMandate.update({ where: { id: mandate.id }, data: { status: "ACTIVE" } });
  }

  const result = await activateSubscriptionFromPayment({
    adminId: mandate.adminId,
    planId: mandate.planId,
    billingCycle: mandate.billingCycle,
    transactionId: transaction.id,
    gatewayPaymentId: opts.razorpayPaymentId,
  });

  return {
    alreadyProcessed: false as const,
    mandateNotFound: false as const,
    adminId: mandate.adminId,
    planId: mandate.planId,
    transactionId: transaction.id,
    ...result,
  };
}

/** Marks a mandate's lifecycle status from a webhook (cancelled/halted/completed/expired)
 * — never touches our own Subscription access, which only ever lapses via the normal
 * endDate-based expiry. Stopping auto-pay just means the NEXT renewal won't happen
 * automatically; whatever period was already paid for still runs its course. */
export async function updateMandateStatus(razorpaySubscriptionId: string, status: "AUTHENTICATED" | "ACTIVE" | "PENDING" | "HALTED" | "CANCELLED" | "COMPLETED" | "EXPIRED") {
  await db.subscriptionAutoPayMandate.updateMany({ where: { razorpaySubscriptionId }, data: { status } });
}

/** The admin's current auto-pay mandate, if any — "current" meaning the latest one
 * regardless of status, so the UI can show e.g. a cancelled mandate's last state too. */
export async function getCurrentAutoPayMandate(adminId: string) {
  return db.subscriptionAutoPayMandate.findFirst({
    where: { adminId },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { name: true } } },
  });
}

export async function cancelAutoPay(adminId: string, mandateId: string) {
  const mandate = await db.subscriptionAutoPayMandate.findUnique({ where: { id: mandateId } });
  if (!mandate) throw new NotFoundError("Auto-pay setup not found.");
  if (mandate.adminId !== adminId) throw new ForbiddenError("This auto-pay setup does not belong to your account.");
  if (mandate.status === "CANCELLED" || mandate.status === "COMPLETED" || mandate.status === "EXPIRED") {
    return mandate;
  }

  await cancelRazorpaySubscription(mandate.razorpaySubscriptionId, false);
  return db.subscriptionAutoPayMandate.update({ where: { id: mandateId }, data: { status: "CANCELLED" } });
}
