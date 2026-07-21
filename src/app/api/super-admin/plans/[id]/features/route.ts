import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { setPlanFeatures } from "@/lib/services/plan";
import { planFeaturesSchema } from "@/lib/validation/plan";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = planFeaturesSchema.parse(body);
    const result = await setPlanFeatures(id, input.features);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
