import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import { ForbiddenError } from "@/lib/session";
import { createOrder, verifyPaymentSignature } from "@/lib/services/razorpay";
import { validateAndPriceCoupon } from "@/lib/services/subscription-coupon";
import { getSubscriptionTaxConfig, calculateTax } from "@/lib/services/subscription-tax";
import { activateSubscriptionFromPayment } from "@/lib/services/subscription-billing";
import type { BillingCycle } from "@/generated/prisma/client";

export interface CheckoutOrderResult {
  transactionId: string;
  gatewayOrderId: string;
  razorpayKeyId: string;
  amount: number; // in the plan's currency's smallest unit (paise for INR)
  currency: string;
  summary: {
    baseAmount: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
  };
}

function priceForCycle(plan: { monthlyPrice: unknown; annualPrice: unknown }, cycle: BillingCycle): number | null {
  const raw = cycle === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
  return raw === null ? null : Number(raw);
}

/** Creates a Razorpay order + the SubscriptionTransaction row tracking it. Never trusts
 * a client-supplied price — baseAmount/discount/tax are all recomputed server-side from
 * the Plan row, the coupon service, and the tax config, every time. */
export async function createCheckoutOrder(adminId: string, opts: { planId: string; billingCycle: BillingCycle; couponCode?: string }): Promise<CheckoutOrderResult> {
  const plan = await db.plan.findUnique({ where: { id: opts.planId } });
  if (!plan || !plan.isActive || plan.isArchived) throw new NotFoundError("This plan is not available for checkout.");

  const baseAmount = priceForCycle(plan, opts.billingCycle);
  if (baseAmount === null) {
    throw new NotFoundError(`${plan.name} does not have a self-service ${opts.billingCycle.toLowerCase()} price — contact sales.`);
  }

  let discountAmount = 0;
  let couponId: string | null = null;
  if (opts.couponCode) {
    const priced = await validateAndPriceCoupon(opts.couponCode, { adminId, planCode: plan.code, baseAmount });
    discountAmount = priced.discountAmount;
    couponId = priced.couponId;
  }

  const taxConfig = await getSubscriptionTaxConfig();
  const taxable = Math.max(0, baseAmount - discountAmount);
  const tax = calculateTax(taxable, taxConfig);

  const transaction = await db.subscriptionTransaction.create({
    data: {
      adminId,
      planId: plan.id,
      billingCycle: opts.billingCycle,
      baseAmount,
      discountAmount,
      taxAmount: tax.taxAmount,
      totalAmount: tax.totalAmount,
      currency: plan.currency,
      status: "INITIATED",
      couponId,
    },
  });

  const razorpayOrder = await createOrder({
    amountPaise: Math.round(tax.totalAmount * 100),
    currency: plan.currency,
    receipt: transaction.id,
    notes: { adminId, planCode: plan.code, billingCycle: opts.billingCycle },
  });

  await db.subscriptionTransaction.update({ where: { id: transaction.id }, data: { gatewayOrderId: razorpayOrder.id } });

  return {
    transactionId: transaction.id,
    gatewayOrderId: razorpayOrder.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    amount: Math.round(tax.totalAmount * 100),
    currency: plan.currency,
    summary: { baseAmount, discountAmount, taxAmount: tax.taxAmount, totalAmount: tax.totalAmount },
  };
}

/** Server-side-verified activation — called by the checkout/verify route right after
 * the Razorpay Checkout widget returns a result client-side. The client's report of
 * success is never trusted on its own; only a valid HMAC signature over
 * (orderId|paymentId) activates anything. */
export async function verifyAndActivate(adminId: string, opts: { transactionId: string; gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) {
  const transaction = await db.subscriptionTransaction.findUnique({ where: { id: opts.transactionId } });
  if (!transaction) throw new NotFoundError("Transaction not found.");
  if (transaction.adminId !== adminId) throw new ForbiddenError("This transaction does not belong to your account.");

  if (transaction.status === "SUCCESS" && transaction.activatedSubscriptionId) {
    return activateSubscriptionFromPayment({
      adminId,
      planId: transaction.planId,
      billingCycle: transaction.billingCycle,
      transactionId: transaction.id,
      gatewayPaymentId: transaction.gatewayPaymentId ?? opts.gatewayPaymentId,
    });
  }

  if (transaction.gatewayOrderId !== opts.gatewayOrderId) {
    throw new ForbiddenError("Order mismatch.");
  }

  verifyPaymentSignature({
    orderId: opts.gatewayOrderId,
    paymentId: opts.gatewayPaymentId,
    signature: opts.gatewaySignature,
  });

  return activateSubscriptionFromPayment({
    adminId,
    planId: transaction.planId,
    billingCycle: transaction.billingCycle,
    transactionId: transaction.id,
    gatewayPaymentId: opts.gatewayPaymentId,
  });
}

/** Owner closed the Razorpay widget without paying, or a webhook reported
 * payment.failed — records the outcome so the transaction history/admin view shows
 * FAILED instead of hanging INITIATED forever. Never downgrades an already-SUCCESS
 * transaction (e.g. a late failure webhook arriving after verify already succeeded). */
export async function markTransactionFailed(transactionId: string, adminId?: string) {
  const transaction = await db.subscriptionTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw new NotFoundError("Transaction not found.");
  if (adminId && transaction.adminId !== adminId) throw new ForbiddenError("This transaction does not belong to your account.");
  if (transaction.status === "SUCCESS") return transaction;
  return db.subscriptionTransaction.update({ where: { id: transactionId }, data: { status: "FAILED" } });
}

/** Webhook backup path — looked up by gatewayOrderId (the webhook payload has no
 * concept of our internal transactionId). The route calling this has already verified
 * the webhook's HMAC signature over the raw body before this runs. */
export async function activateFromWebhook(opts: { gatewayOrderId: string; gatewayPaymentId: string }) {
  const transaction = await db.subscriptionTransaction.findFirst({ where: { gatewayOrderId: opts.gatewayOrderId } });
  if (!transaction) throw new NotFoundError("No matching transaction for this order.");

  if (transaction.status === "SUCCESS" && transaction.activatedSubscriptionId) {
    return { alreadyActivated: true as const };
  }

  return activateSubscriptionFromPayment({
    adminId: transaction.adminId,
    planId: transaction.planId,
    billingCycle: transaction.billingCycle,
    transactionId: transaction.id,
    gatewayPaymentId: opts.gatewayPaymentId,
  });
}
