import { requireAdminSession } from "@/lib/session";
import { getCurrentSubscription, computeDisplayStatus, computeDaysRemaining, computeGraceDaysRemaining } from "@/lib/services/subscription";
import { getUsageSnapshot } from "@/lib/services/subscription-limits";
import { getPurchasablePlans } from "@/lib/services/subscription-checkout";
import { getCurrentAutoPayMandate } from "@/lib/services/subscription-autopay";
import { db } from "@/lib/db";
import { SubscriptionPageClient } from "@/components/admin/subscription/subscription-page-client";

const ACTIVE_MANDATE_STATUSES = new Set(["CREATED", "AUTHENTICATED", "ACTIVE", "PENDING"]);

export default async function SubscriptionPage() {
  const session = await requireAdminSession();

  const [subscription, usage, plansForClient, invoices, mandate] = await Promise.all([
    getCurrentSubscription(session.adminId),
    getUsageSnapshot(session.adminId),
    getPurchasablePlans(session.adminId),
    db.subscriptionTransaction.findMany({
      where: { adminId: session.adminId, status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      include: { plan: { select: { name: true } }, coupon: { select: { code: true } } },
    }),
    getCurrentAutoPayMandate(session.adminId),
  ]);

  const displayStatus = computeDisplayStatus(subscription);
  const daysRemaining = computeDaysRemaining(subscription.endDate);
  const graceDaysRemaining = computeGraceDaysRemaining(displayStatus, subscription.gracePeriodDays, daysRemaining);

  const invoicesForClient = invoices.map((t: (typeof invoices)[number]) => ({
    id: t.id,
    invoiceNumber: t.invoiceNumber ?? "",
    planName: t.plan.name,
    billingCycle: t.billingCycle,
    baseAmount: Number(t.baseAmount),
    discountAmount: Number(t.discountAmount),
    taxAmount: Number(t.taxAmount),
    totalAmount: Number(t.totalAmount),
    currency: t.currency,
    couponCode: t.coupon?.code ?? null,
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
  }));

  return (
    <SubscriptionPageClient
      current={{
        planCode: subscription.planCode,
        planName: subscription.planName,
        resolvedPlanId: subscription.resolvedPlanId,
        status: displayStatus,
        endDate: subscription.endDate ? subscription.endDate.toISOString() : null,
        daysRemaining,
        graceDaysRemaining,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      }}
      usage={usage}
      plans={plansForClient}
      invoices={invoicesForClient}
      autoPayMandate={
        mandate && ACTIVE_MANDATE_STATUSES.has(mandate.status)
          ? { id: mandate.id, planName: mandate.plan.name, status: mandate.status }
          : null
      }
    />
  );
}
