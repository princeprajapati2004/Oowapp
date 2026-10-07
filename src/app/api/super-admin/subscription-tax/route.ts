import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getSubscriptionTaxConfig, setSubscriptionTaxConfig, subscriptionTaxConfigSchema } from "@/lib/services/subscription-tax";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET() {
  try {
    await requireSuperAdminSession();
    const config = await getSubscriptionTaxConfig();
    return NextResponse.json(config);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSuperAdminSession();
    const body = await request.json();
    const input = subscriptionTaxConfigSchema.parse(body);
    await setSubscriptionTaxConfig(input);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "PLATFORM_SETTINGS_UPDATED",
      actorType: "super_admin",
      actorId: session.superAdminId,
      targetType: "platform_settings",
      targetId: "subscription_tax_config",
      metadata: { event: "subscription_tax_config_changed" },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(input);
  } catch (error) {
    return handleApiError(error);
  }
}
