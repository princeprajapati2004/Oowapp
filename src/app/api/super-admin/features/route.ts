import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listFeatures, createFeature } from "@/lib/services/plan";
import { featureSchema } from "@/lib/validation/plan";

export async function GET() {
  try {
    await requireSuperAdminSession();
    const features = await listFeatures();
    return NextResponse.json(features);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdminSession();
    const body = await request.json();
    const input = featureSchema.parse(body);
    const feature = await createFeature(input);
    return NextResponse.json(feature, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
