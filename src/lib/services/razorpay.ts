// Thin adapter around the `razorpay` SDK — isolates the rest of the app from the SDK's
// shape, same adapter-boundary convention as sms-provider.ts. Nothing outside this file
// should `import Razorpay from "razorpay"` directly.

import Razorpay from "razorpay";
import { validatePaymentVerification, validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils";
import { PaymentGatewayError, PaymentVerificationError } from "@/lib/api-utils";

let _client: Razorpay | null = null;

function getClient(): Razorpay {
  if (_client) return _client;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new PaymentGatewayError("Payment gateway is not configured. Please contact support.");
  }
  _client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return _client;
}

/** Whether Razorpay env vars are present — checked before showing checkout UI/CTAs
 * server-side so an unconfigured environment degrades to a clear message instead of a
 * broken checkout attempt. */
export function isRazorpayConfigured(): boolean {
  return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
}

interface CreateOrderOpts {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
  // Razorpay Route: when set, the full order amount settles to this linked
  // account (acc_...) instead of the platform's own default settlement
  // account. Pure/deterministic from its inputs — kept separate from
  // createOrder() below so the request shape can be verified without a live
  // network call or real API credentials.
  transferToAccountId?: string;
}

export function buildOrderPayload(opts: CreateOrderOpts) {
  return {
    amount: opts.amountPaise,
    currency: opts.currency,
    receipt: opts.receipt,
    notes: opts.notes,
    ...(opts.transferToAccountId
      ? {
          transfers: [
            {
              account: opts.transferToAccountId,
              amount: opts.amountPaise,
              currency: opts.currency,
            },
          ],
        }
      : {}),
  };
}

/** Amount must be the smallest currency unit (paise for INR) — callers convert. */
export async function createOrder(opts: CreateOrderOpts) {
  const client = getClient();
  try {
    return await client.orders.create(buildOrderPayload(opts));
  } catch (err: unknown) {
    // The Razorpay SDK rejects API errors with a plain object shaped like
    // { statusCode, error: { code, description, reason, source, step } } —
    // not a native Error, so `err instanceof Error` never matches and the
    // real rejection reason (e.g. "This transfer is not supported") was
    // being silently discarded in favor of a generic fallback. Surface it.
    const description = (err as { error?: { description?: string } } | undefined)?.error?.description;
    const message = description ?? (err instanceof Error ? err.message : undefined) ?? "Failed to create payment order.";
    throw new PaymentGatewayError(message);
  }
}

/** Razorpay Route linked account subscription payments settle to — unset means no
 * transfer is attached and orders settle to the platform's own default account. */
export function getSubscriptionRouteAccountId(): string | undefined {
  return process.env.RAZORPAY_ROUTE_ACCOUNT_ID || undefined;
}

/** Merchant ID for the linked account above — not used by the transfer API itself
 * (transfers only need the account id), kept as order-notes metadata for reference. */
export function getSubscriptionRouteMerchantId(): string | undefined {
  return process.env.RAZORPAY_ROUTE_MERCHANT_ID || undefined;
}

/**
 * Server-side verification of the client-returned checkout result — this, not the
 * frontend's "payment succeeded" callback, is what's allowed to activate a
 * subscription. Throws PaymentVerificationError (never silently returns false) so a
 * forged attempt always surfaces as a clear 400, not a generic failure.
 *
 * Exactly one of orderId/subscriptionId must be set — Razorpay signs a
 * different payload for each (`orderId|paymentId` vs `paymentId|subscriptionId`,
 * see razorpay-utils.js's validatePaymentVerification), so passing the wrong
 * one always fails verification even with a genuine signature.
 */
export function verifyPaymentSignature(
  opts: { paymentId: string; signature: string } & ({ orderId: string; subscriptionId?: never } | { orderId?: never; subscriptionId: string })
): void {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new PaymentGatewayError("Payment gateway is not configured. Please contact support.");

  const params = opts.orderId
    ? { order_id: opts.orderId, payment_id: opts.paymentId }
    : { subscription_id: opts.subscriptionId as string, payment_id: opts.paymentId };
  const valid = validatePaymentVerification(params, opts.signature, keySecret);
  if (!valid) throw new PaymentVerificationError("Payment verification failed — the signature did not match.");
}

interface CreateRazorpayPlanOpts {
  name: string;
  amountPaise: number;
  currency: string;
  period: "monthly" | "yearly";
  interval: number;
  notes?: Record<string, string>;
}

/** A fresh Razorpay Plan object — callers should create one per auto-pay setup
 * rather than caching an id, since Razorpay Plan amounts are immutable (see
 * SubscriptionAutoPayMandate's schema doc comment for why that matters). */
export async function createRazorpayPlan(opts: CreateRazorpayPlanOpts) {
  const client = getClient();
  try {
    return await client.plans.create({
      item: { name: opts.name, amount: opts.amountPaise, currency: opts.currency },
      period: opts.period,
      interval: opts.interval,
      notes: opts.notes,
    });
  } catch (err: unknown) {
    const description = (err as { error?: { description?: string } } | undefined)?.error?.description;
    const message = description ?? (err instanceof Error ? err.message : undefined) ?? "Failed to create a recurring billing plan.";
    throw new PaymentGatewayError(message);
  }
}

interface CreateRazorpaySubscriptionOpts {
  razorpayPlanId: string;
  totalCount: number;
  notes?: Record<string, string>;
}

export async function createRazorpaySubscription(opts: CreateRazorpaySubscriptionOpts) {
  const client = getClient();
  try {
    return await client.subscriptions.create({
      plan_id: opts.razorpayPlanId,
      total_count: opts.totalCount,
      customer_notify: 1,
      notes: opts.notes,
    });
  } catch (err: unknown) {
    const description = (err as { error?: { description?: string } } | undefined)?.error?.description;
    const message = description ?? (err instanceof Error ? err.message : undefined) ?? "Failed to set up auto-pay.";
    throw new PaymentGatewayError(message);
  }
}

/** cancelAtCycleEnd=false (default) cancels immediately — Razorpay stops charging
 * right away either way; this only controls whether an *already-collected* current
 * cycle keeps running. Our own Subscription access is never tied to this — it still
 * lapses only via the normal endDate-based expiry, same as any other cancellation. */
export async function cancelRazorpaySubscription(razorpaySubscriptionId: string, cancelAtCycleEnd = false) {
  const client = getClient();
  try {
    return await client.subscriptions.cancel(razorpaySubscriptionId, cancelAtCycleEnd);
  } catch (err: unknown) {
    const description = (err as { error?: { description?: string } } | undefined)?.error?.description;
    const message = description ?? (err instanceof Error ? err.message : undefined) ?? "Failed to cancel auto-pay.";
    throw new PaymentGatewayError(message);
  }
}

/** Webhook signature check — `rawBody` MUST be the exact raw request bytes (as text),
 * computed BEFORE any JSON.parse. Parsing first and re-stringifying to verify would
 * silently break on any key-order/whitespace difference from what Razorpay actually
 * sent and signed. */
export function verifyWebhookSignature(rawBody: string, signature: string): void {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new PaymentGatewayError("Webhook secret is not configured.");
  const valid = validateWebhookSignature(rawBody, signature, secret);
  if (!valid) throw new PaymentVerificationError("Webhook signature did not match.");
}
