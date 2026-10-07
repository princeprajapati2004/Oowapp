import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listFeatures, createFeature } from "@/lib/services/plan";
import { featureSchema } from "@/lib/validation/plan";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

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
    const session = await requireSuperAdminSession();
    const body = await request.json();
    const input = featureSchema.parse(body);
    const feature = await createFeature(input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "FEATURE_CREATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "feature",
      targetId: feature.id,
      metadata: { key: feature.key, label: feature.label },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(feature, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
