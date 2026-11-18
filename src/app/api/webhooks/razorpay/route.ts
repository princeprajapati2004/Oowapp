import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/services/razorpay";
import { activateFromWebhook, markTransactionFailed } from "@/lib/services/subscription-checkout";
import { recordRecurringCharge, updateMandateStatus } from "@/lib/services/subscription-autopay";
import { notifyAdminShops } from "@/lib/services/notification";
import { sendEmail } from "@/lib/services/email";
import { buildSubscriptionReceiptTemplate } from "@/lib/services/email-templates";
import { formatCurrency } from "@/lib/utils/currency";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id?: string;
        amount: number;
        currency: string;
      };
    };
    subscription?: {
      entity: {
        id: string;
        status: string;
      };
    };
  };
}

const MANDATE_LIFECYCLE_EVENTS: Record<string, "AUTHENTICATED" | "ACTIVE" | "HALTED" | "CANCELLED" | "COMPLETED" | "EXPIRED"> = {
  "subscription.authenticated": "AUTHENTICATED",
  "subscription.activated": "ACTIVE",
  "subscription.halted": "HALTED",
  "subscription.cancelled": "CANCELLED",
  "subscription.completed": "COMPLETED",
  "subscription.expired": "EXPIRED",
};

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
    const subscription = body.payload.subscription?.entity;

    // order_id is only present on a one-time Orders-API payment — a recurring
    // subscription charge's payment entity has no order_id at all, and must
    // never fall through to the one-time lookup below (Prisma treats an
    // `undefined` filter value as "no filter," which could otherwise match
    // an unrelated row instead of finding nothing).
    if (body.event === "payment.captured" && payment?.order_id) {
      await activateFromWebhook({ gatewayOrderId: payment.order_id, gatewayPaymentId: payment.id });
    } else if (body.event === "payment.failed" && payment?.order_id) {
      const transaction = await db.subscriptionTransaction.findFirst({ where: { gatewayOrderId: payment.order_id } });
      if (transaction) await markTransactionFailed(transaction.id);
    } else if (body.event === "subscription.charged" && subscription && payment) {
      const result = await recordRecurringCharge({
        razorpaySubscriptionId: subscription.id,
        razorpayPaymentId: payment.id,
        amountPaise: payment.amount,
        currency: payment.currency,
      });
      if (!result.alreadyProcessed && !result.mandateNotFound && !result.alreadyActivated) {
        await sendRenewalReceipt(result.adminId, result.planId, result.transactionId);
      }
    } else if (subscription && body.event in MANDATE_LIFECYCLE_EVENTS) {
      await updateMandateStatus(subscription.id, MANDATE_LIFECYCLE_EVENTS[body.event]);
    }

    // Always 200 once the signature is valid — Razorpay retries on non-2xx, and a
    // webhook for an event we don't act on (or a transaction we can't find, e.g. a
    // stale/cancelled checkout) isn't something retrying would fix.
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/** In-app notification + best-effort receipt email for an auto-pay renewal —
 * no customer is present for a recurring cycle, so unlike the client-driven
 * verify routes, this is the only place either ever fires for cycles 2+. */
async function sendRenewalReceipt(adminId: string, planId: string, transactionId: string) {
  const [plan, admin, transaction] = await Promise.all([
    db.plan.findUnique({ where: { id: planId } }),
    db.admin.findUnique({ where: { id: adminId }, select: { email: true } }),
    db.subscriptionTransaction.findUnique({ where: { id: transactionId } }),
  ]);

  await notifyAdminShops(adminId, {
    type: "SUBSCRIPTION_ACTIVATED",
    title: "Subscription renewed",
    body: `Your ${plan?.name ?? "plan"} subscription renewed automatically via auto-pay.`,
    link: "/admin/subscription",
  }).catch(() => {});

  if (admin?.email && transaction?.invoiceNumber) {
    const template = buildSubscriptionReceiptTemplate({
      planName: plan?.name ?? "your plan",
      billingCycle: transaction.billingCycle,
      totalAmountFormatted: formatCurrency(Number(transaction.totalAmount), transaction.currency),
      invoiceNumber: transaction.invoiceNumber,
    });
    await sendEmail(admin.email, "Your OOWAPP subscription receipt", template.html, template.text).catch(() => {});
  }
}
