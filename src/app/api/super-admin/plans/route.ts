import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listPlans, createPlan } from "@/lib/services/plan";
import { planSchema } from "@/lib/validation/plan";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET() {
  try {
    await requireSuperAdminSession();
    const plans = await listPlans();
    return NextResponse.json(plans);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdminSession();
    const body = await request.json();
    const input = planSchema.parse(body);
    const plan = await createPlan(input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "PLAN_CREATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "plan",
      targetId: plan.id,
      metadata: { code: plan.code, name: plan.name },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
