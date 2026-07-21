import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { updatePlan } from "@/lib/services/plan";
import { planUpdateSchema } from "@/lib/validation/plan";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = planUpdateSchema.parse(body);
    const plan = await updatePlan(id, input);
    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}
