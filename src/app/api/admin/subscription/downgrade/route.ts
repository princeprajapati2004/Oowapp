import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { scheduleDowngradeSchema } from "@/lib/validation/subscription-checkout";
import { getUsageSnapshot } from "@/lib/services/subscription-limits";
import { scheduleDowngrade, cancelScheduledDowngrade } from "@/lib/services/subscription-billing";
import { changePlan } from "@/lib/services/subscription-admin";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { db } from "@/lib/db";
import type { LimitKey } from "@/generated/prisma/client";

// Downgrade is only ever applied immediately when current usage already fits every
// limit on the target plan; otherwise it's scheduled for the end of the current
// billing period (never blocked outright, and never deletes data either way) — per
// the subscription spec's downgrade-safety rule.
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = scheduleDowngradeSchema.parse(body);

    const targetPlan = await db.plan.findUnique({ where: { id: input.planId }, include: { planLimits: true } });
    if (!targetPlan) throw new NotFoundError("Plan not found");

    const usage = await getUsageSnapshot(session.adminId);
    const blockers = targetPlan.planLimits
      .filter((limit: (typeof targetPlan.planLimits)[number]) => limit.limitValue !== null && usage[limit.limitKey as LimitKey].used > limit.limitValue)
      .map((limit: (typeof targetPlan.planLimits)[number]) => ({ limitKey: limit.limitKey, used: usage[limit.limitKey as LimitKey].used, newLimit: limit.limitValue }));

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    if (blockers.length === 0) {
      const subscription = await changePlan(session.shopId, {
        createdBy: session.adminId,
        planCode: targetPlan.code,
        remarks: "Owner self-service downgrade (usage fit the new plan immediately).",
      });

      await writeAuditLog({
        action: "SUBSCRIPTION_CHANGED",
        actorType: "admin",
        actorId: session.adminId,
        targetType: "subscription",
        targetId: subscription.id,
        metadata: { changeType: "downgrade", applied: "immediate", planCode: targetPlan.code },
        ipAddress,
        userAgent,
        requestId,
      });

      return NextResponse.json({ applied: "immediate", subscription });
    }

    const subscription = await scheduleDowngrade(session.adminId, {
      pendingPlanId: targetPlan.id,
      pendingBillingCycle: input.billingCycle,
      createdBy: session.adminId,
    });

    await writeAuditLog({
      action: "SUBSCRIPTION_CHANGED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "subscription",
      targetId: subscription.id,
      metadata: { changeType: "downgrade", applied: "scheduled", planCode: targetPlan.code, blockers },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ applied: "scheduled", blockers, subscription });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdminSession();
    const subscription = await cancelScheduledDowngrade(session.adminId, { createdBy: session.adminId });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "SUBSCRIPTION_CHANGED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "subscription",
      targetId: subscription.id,
      metadata: { changeType: "downgrade_cancelled" },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    return handleApiError(error);
  }
}
