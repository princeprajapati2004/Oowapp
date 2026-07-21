import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { subscriptionActionSchema } from "@/lib/validation/subscription";
import {
  getSubscriptionDetailForSuperAdmin,
  createSubscription,
  renewSubscription,
  extendSubscription,
  changePlan,
  suspendSubscription,
  resumeSubscription,
  expireSubscription,
} from "@/lib/services/subscription-admin";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdminSession();
    const { id } = await params;
    const detail = await getSubscriptionDetailForSuperAdmin(id);
    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = subscriptionActionSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    const actor = { createdBy: session.superAdminId, remarks: input.remarks };

    let subscription;
    switch (input.action) {
      case "create":
        subscription = await createSubscription(id, {
          ...actor,
          planCode: input.planCode,
          duration: input.duration,
          endDate: input.endDate,
        });
        break;
      case "renew":
        subscription = await renewSubscription(id, {
          ...actor,
          duration: input.duration,
          endDate: input.endDate,
        });
        break;
      case "extend":
        subscription = await extendSubscription(id, {
          ...actor,
          duration: input.duration,
          endDate: input.endDate,
        });
        break;
      case "change_plan":
        subscription = await changePlan(id, { ...actor, planCode: input.planCode });
        break;
      case "suspend":
        subscription = await suspendSubscription(id, actor);
        break;
      case "resume":
        subscription = await resumeSubscription(id, actor);
        break;
      case "expire":
        subscription = await expireSubscription(id, actor);
        break;
    }

    await writeAuditLog({
      action: "SUBSCRIPTION_CHANGED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "shop",
      targetId: id,
      shopId: id,
      metadata: { action: input.action, remarks: input.remarks ?? null },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(subscription, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
