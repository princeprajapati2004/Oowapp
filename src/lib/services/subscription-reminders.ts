import { db } from "@/lib/db";
import {
  getLatestSubscriptionsByAdminIds,
  computeDisplayStatus,
  computeDaysRemaining,
  computeGraceDaysRemaining,
  type DisplayStatus,
} from "@/lib/services/subscription";
import { notifyAdminShops } from "@/lib/services/notification";
import { sendEmail } from "@/lib/services/email";
import { buildSubscriptionExpiryReminderTemplate, type ExpiryReminderKind } from "@/lib/services/email-templates";
import type { SubscriptionReminderType } from "@/generated/prisma/client";

function pickReminderType(status: DisplayStatus, daysRemaining: number | null): SubscriptionReminderType | null {
  if (status === "EXPIRING_SOON" && daysRemaining !== null) {
    if (daysRemaining <= 1) return "DAYS_1_BEFORE";
    if (daysRemaining <= 3) return "DAYS_3_BEFORE";
    if (daysRemaining <= 7) return "DAYS_7_BEFORE";
  }
  if (status === "GRACE") return "GRACE_PERIOD";
  if (status === "EXPIRED") return "ON_EXPIRY";
  return null;
}

const REMINDER_TITLES: Record<SubscriptionReminderType, string> = {
  DAYS_7_BEFORE: "Your subscription expires in 7 days",
  DAYS_3_BEFORE: "Your subscription expires in 3 days",
  DAYS_1_BEFORE: "Your subscription expires tomorrow",
  ON_EXPIRY: "Your subscription has expired",
  GRACE_PERIOD: "You're in your grace period",
};

function reminderBody(reminderType: SubscriptionReminderType, planName: string, graceDaysRemaining: number): string {
  if (reminderType === "ON_EXPIRY") return `Your ${planName} plan has expired. Renew now to restore access.`;
  if (reminderType === "GRACE_PERIOD") {
    return `Your ${planName} plan expired, but you have ${graceDaysRemaining} day${graceDaysRemaining === 1 ? "" : "s"} left in your grace period with full access. Renew before it ends.`;
  }
  return `Your ${planName} plan is expiring soon. Renew to avoid interruption.`;
}

/**
 * Daily sweep, meant to be driven by a secured cron-triggered API route (see
 * /api/cron/subscription-reminders) — this codebase otherwise never runs a
 * background job (every other status is lazily re-derived at read time, see
 * subscription.ts), but sending a notification is a one-time action, not a
 * value, so it genuinely needs an external trigger.
 *
 * Idempotent via SubscriptionReminderLog's unique (subscriptionId,
 * reminderType) — the row is inserted *before* the notification is sent and
 * doubles as the lock, so calling this twice in a day, or two overlapping
 * invocations racing each other, never sends the same milestone twice. Each
 * Subscription row covers exactly one fixed billing period (renewals always
 * create a new row — see subscription-billing.ts), so there's no separate
 * "which period" key to track.
 */
export async function runSubscriptionReminderSweep(): Promise<{ checked: number; sent: number; failed: number }> {
  const admins = await db.admin.findMany({ select: { id: true } });
  const subsByAdmin = await getLatestSubscriptionsByAdminIds(admins.map((a: { id: string }) => a.id));

  let sent = 0;
  let failed = 0;

  for (const [adminId, sub] of subsByAdmin) {
    if (!sub.id) continue; // virtual FREE/TRIAL fallback — no real row to log against
    if (sub.status === "SUSPENDED" || sub.status === "CANCELLED") continue; // deliberate admin actions, not a natural-expiry event

    const displayStatus = computeDisplayStatus(sub);
    const daysRemaining = computeDaysRemaining(sub.endDate);
    const reminderType = pickReminderType(displayStatus, daysRemaining);
    if (!reminderType) continue;

    try {
      await db.subscriptionReminderLog.create({ data: { subscriptionId: sub.id, reminderType } });
    } catch {
      continue; // unique constraint hit — already sent for this subscription+milestone
    }

    const graceDaysRemaining = computeGraceDaysRemaining(displayStatus, sub.gracePeriodDays, daysRemaining) ?? 0;

    try {
      await notifyAdminShops(adminId, {
        type: "SUBSCRIPTION_EXPIRING",
        title: REMINDER_TITLES[reminderType],
        body: reminderBody(reminderType, sub.planName, graceDaysRemaining),
        link: "/admin/subscription",
      });

      // Email is best-effort — the in-app notification above is the
      // authoritative signal, same convention as the receipt email in
      // checkout/verify's activation flow ("a receipt email failure must
      // never block activation"). A failed send here is simply lost rather
      // than retried, since the log row above is already committed; that's
      // an acceptable tradeoff for a reminder (not a legally-required
      // receipt), and keeps the idempotency lock race-free.
      const admin = await db.admin.findUnique({ where: { id: adminId }, select: { email: true } });
      if (admin?.email) {
        const template = buildSubscriptionExpiryReminderTemplate({
          kind: reminderType as ExpiryReminderKind,
          planName: sub.planName,
          graceDaysRemaining,
        });
        await sendEmail(admin.email, template.subject, template.html, template.text).catch(() => {});
      }
      sent++;
    } catch (err) {
      failed++;
      console.error(`subscription reminder (${reminderType}) failed for admin ${adminId}:`, err);
    }
  }

  return { checked: subsByAdmin.size, sent, failed };
}
