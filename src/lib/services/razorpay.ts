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

/** Amount must be the smallest currency unit (paise for INR) — callers convert. */
export async function createOrder(opts: { amountPaise: number; currency: string; receipt: string; notes?: Record<string, string> }) {
  const client = getClient();
  try {
    return await client.orders.create({
      amount: opts.amountPaise,
      currency: opts.currency,
      receipt: opts.receipt,
      notes: opts.notes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create payment order.";
    throw new PaymentGatewayError(message);
  }
}

/** Server-side verification of the client-returned checkout result — this, not the
 * frontend's "payment succeeded" callback, is what's allowed to activate a
 * subscription. Throws PaymentVerificationError (never silently returns false) so a
 * forged attempt always surfaces as a clear 400, not a generic failure. */
export function verifyPaymentSignature(opts: { orderId: string; paymentId: string; signature: string }): void {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new PaymentGatewayError("Payment gateway is not configured. Please contact support.");

  const valid = validatePaymentVerification(
    { order_id: opts.orderId, payment_id: opts.paymentId },
    opts.signature,
    keySecret
  );
  if (!valid) throw new PaymentVerificationError("Payment verification failed — the signature did not match.");
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
