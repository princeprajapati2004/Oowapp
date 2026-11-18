import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { verifyAutoPaySetup } from "@/lib/services/subscription-autopay";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { notifyAdminShops } from "@/lib/services/notification";
import { sendEmail } from "@/lib/services/email";
import { buildSubscriptionReceiptTemplate } from "@/lib/services/email-templates";
import { formatCurrency } from "@/lib/utils/currency";
import { db } from "@/lib/db";

const verifyAutoPaySchema = z.object({
  mandateId: z.string().trim().min(1),
  razorpayPaymentId: z.string().trim().min(1),
  razorpaySignature: z.string().trim().min(1),
});

// Server-side-verified activation only — same rule as /checkout/verify: the
// Razorpay Checkout widget's client-side callback is never, on its own,
// enough to activate anything. This is only cycle 1; every later cycle is
// activated by the subscription.charged webhook instead (no customer
// present to drive this route again).
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = verifyAutoPaySchema.parse(body);

    const result = await verifyAutoPaySetup(session.adminId, input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "SUBSCRIPTION_PAYMENT_SUCCEEDED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "subscription",
      targetId: result.subscription.id,
      metadata: { mandateId: input.mandateId, autoPay: true, alreadyActivated: result.alreadyActivated },
      ipAddress,
      userAgent,
      requestId,
    });

    if (!result.alreadyActivated) {
      const [plan, admin, transaction] = await Promise.all([
        result.subscription.planId ? db.plan.findUnique({ where: { id: result.subscription.planId } }) : null,
        db.admin.findUnique({ where: { id: session.adminId }, select: { email: true } }),
        db.subscriptionTransaction.findFirst({ where: { autoPayMandateId: input.mandateId }, orderBy: { createdAt: "desc" } }),
      ]);

      await notifyAdminShops(session.adminId, {
        type: "SUBSCRIPTION_ACTIVATED",
        title: "Auto-pay activated",
        body: `Your ${plan?.name ?? "plan"} subscription is now active and will renew automatically.`,
        link: "/admin/subscription",
      });

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

    return NextResponse.json({ ok: true, subscriptionId: result.subscription.id });
  } catch (error) {
    return handleApiError(error);
  }
}
