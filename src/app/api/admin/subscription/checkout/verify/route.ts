import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { verifyCheckoutSchema } from "@/lib/validation/subscription-checkout";
import { verifyAndActivate } from "@/lib/services/subscription-checkout";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { notifyAdminShops } from "@/lib/services/notification";
import { sendEmail } from "@/lib/services/email";
import { buildSubscriptionReceiptTemplate } from "@/lib/services/email-templates";
import { formatCurrency } from "@/lib/utils/currency";
import { db } from "@/lib/db";

// Server-side-verified activation only — the Razorpay Checkout widget's client-side
// "payment succeeded" callback is never, on its own, enough to activate anything. This
// route re-derives and checks the HMAC signature itself (see razorpay.ts) before
// verifyAndActivate writes any Subscription row.
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = verifyCheckoutSchema.parse(body);

    const result = await verifyAndActivate(session.adminId, input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "SUBSCRIPTION_PAYMENT_SUCCEEDED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "subscription",
      targetId: result.subscription.id,
      metadata: { transactionId: input.transactionId, alreadyActivated: result.alreadyActivated },
      ipAddress,
      userAgent,
      requestId,
    });

    if (!result.alreadyActivated) {
      const [plan, admin, transaction] = await Promise.all([
        result.subscription.planId ? db.plan.findUnique({ where: { id: result.subscription.planId } }) : null,
        db.admin.findUnique({ where: { id: session.adminId }, select: { email: true } }),
        db.subscriptionTransaction.findUnique({ where: { id: input.transactionId } }),
      ]);

      await notifyAdminShops(session.adminId, {
        type: "SUBSCRIPTION_ACTIVATED",
        title: "Subscription activated",
        body: `Your ${plan?.name ?? "plan"} subscription is now active.`,
        link: "/admin/subscription",
      });

      if (admin?.email && transaction?.invoiceNumber) {
        const template = buildSubscriptionReceiptTemplate({
          planName: plan?.name ?? "your plan",
          billingCycle: transaction.billingCycle,
          totalAmountFormatted: formatCurrency(Number(transaction.totalAmount), transaction.currency),
          invoiceNumber: transaction.invoiceNumber,
        });
        // Best-effort — a receipt email failure must never block activation, which
        // has already succeeded by this point.
        await sendEmail(admin.email, "Your OOWAPP subscription receipt", template.html, template.text).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, subscriptionId: result.subscription.id });
  } catch (error) {
    return handleApiError(error);
  }
}
