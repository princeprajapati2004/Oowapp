import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { archivePlan } from "@/lib/services/plan";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdminSession();
    const { id } = await params;
    const plan = await archivePlan(id);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "PLAN_UPDATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "plan",
      targetId: plan.id,
      metadata: { event: "archived" },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}
