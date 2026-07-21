import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { featurePermissionSchema } from "@/lib/validation/subscription";
import { getFeaturePermissionsForBusiness, setFeaturePermission } from "@/lib/services/feature-permission";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdminSession();
    const { id } = await params;
    const permissions = await getFeaturePermissionsForBusiness(id);
    return NextResponse.json(permissions);
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
    const input = featurePermissionSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const permission = await setFeaturePermission(id, {
      featureId: input.featureId,
      enabled: input.enabled,
      reason: input.reason,
      updatedBy: session.superAdminId,
    });

    await writeAuditLog({
      action: "SUBSCRIPTION_CHANGED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "shop",
      targetId: id,
      shopId: id,
      metadata: {
        event: "feature_permission_changed",
        featureId: input.featureId,
        enabled: input.enabled,
        reason: input.reason ?? null,
      },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(permission);
  } catch (error) {
    return handleApiError(error);
  }
}
