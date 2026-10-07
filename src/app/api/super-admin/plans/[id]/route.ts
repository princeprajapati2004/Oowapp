import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getPlan, updatePlan } from "@/lib/services/plan";
import { planUpdateSchema } from "@/lib/validation/plan";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdminSession();
    const { id } = await params;
    const plan = await getPlan(id);
    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = planUpdateSchema.parse(body);
    const plan = await updatePlan(id, input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "PLAN_UPDATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "plan",
      targetId: plan.id,
      metadata: { changes: input },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}
