import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/services/razorpay";
import { activateFromWebhook, markTransactionFailed } from "@/lib/services/subscription-checkout";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
      };
    };
  };
}

// Gateway-signed, unauthenticated (Razorpay's servers call this, not a logged-in
// owner) — backup activation path for a checkout where the browser was closed before
// the client-side verify call completed. The primary path is
// POST /api/admin/subscription/checkout/verify; this just covers the gap.
//
// CRITICAL: the signature is computed over the EXACT raw request bytes — read as text
// and verified BEFORE any JSON.parse. Parsing first and re-stringifying to verify
// would silently break on any key-order/whitespace difference from what Razorpay
// actually signed.
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }
    verifyWebhookSignature(rawBody, signature);

    const body = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const payment = body.payload.payment?.entity;

    if (body.event === "payment.captured" && payment) {
      await activateFromWebhook({ gatewayOrderId: payment.order_id, gatewayPaymentId: payment.id });
    } else if (body.event === "payment.failed" && payment) {
      const transaction = await db.subscriptionTransaction.findFirst({ where: { gatewayOrderId: payment.order_id } });
      if (transaction) await markTransactionFailed(transaction.id);
    }

    // Always 200 once the signature is valid — Razorpay retries on non-2xx, and a
    // webhook for an event we don't act on (or a transaction we can't find, e.g. a
    // stale/cancelled checkout) isn't something retrying would fix.
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
