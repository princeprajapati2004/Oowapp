import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { setPlanLimits } from "@/lib/services/plan";
import { planLimitsSchema } from "@/lib/validation/plan";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = planLimitsSchema.parse(body);
    const result = await setPlanLimits(id, input.limits);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "PLAN_UPDATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "plan",
      targetId: id,
      metadata: { event: "limits_changed", limits: input.limits },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
