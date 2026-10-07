import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { duplicatePlan } from "@/lib/services/plan";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

const duplicateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores only"),
  name: z.string().trim().min(1).max(60),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = duplicateSchema.parse(body);
    const plan = await duplicatePlan(id, input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "PLAN_CREATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "plan",
      targetId: plan.id,
      metadata: { event: "duplicated", sourcePlanId: id },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
