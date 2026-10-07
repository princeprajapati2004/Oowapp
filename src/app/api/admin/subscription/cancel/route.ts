import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { scheduleDowngrade } from "@/lib/services/subscription-billing";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { db } from "@/lib/db";

// "Cancel Subscription" = schedule a downgrade to the internal FREE/trial plan at the
// end of the current billing period — never immediate, never deletes data. The owner
// keeps full access (and can still Upgrade again, or un-cancel) until the period ends.
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();

    const freePlan = await db.plan.findUnique({ where: { code: "FREE" } });
    if (!freePlan) throw new NotFoundError("Default plan not configured.");

    const subscription = await scheduleDowngrade(session.adminId, {
      pendingPlanId: freePlan.id,
      pendingBillingCycle: "MONTHLY",
      createdBy: session.adminId,
    });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "SUBSCRIPTION_CHANGED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "subscription",
      targetId: subscription.id,
      metadata: { changeType: "cancel" },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    return handleApiError(error);
  }
}
