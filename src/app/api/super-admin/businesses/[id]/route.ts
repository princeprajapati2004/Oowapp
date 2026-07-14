import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminSession } from "@/lib/session";
import {
  getBusinessById,
  suspendBusiness,
  activateBusiness,
  softDeleteBusiness,
} from "@/lib/services/business-management";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { handleApiError } from "@/lib/api-utils";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: z.string().min(1, "Reason is required") }),
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("delete") }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdminSession();
    const { id } = await params;
    const business = await getBusinessById(id);
    return NextResponse.json(business);
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
    const input = patchSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    let shop;
    if (input.action === "suspend") {
      shop = await suspendBusiness(id, input.reason);
      await writeAuditLog({
        action: "SHOP_SUSPENDED",
        actorType: "super_admin",
        actorId: session.superAdminId,
        targetType: "shop",
        targetId: id,
        shopId: id,
        metadata: { reason: input.reason },
        ipAddress,
        userAgent,
        requestId,
      });
    } else if (input.action === "activate") {
      shop = await activateBusiness(id);
      await writeAuditLog({
        action: "SHOP_ACTIVATED",
        actorType: "super_admin",
        actorId: session.superAdminId,
        targetType: "shop",
        targetId: id,
        shopId: id,
        ipAddress,
        userAgent,
        requestId,
      });
    } else {
      shop = await softDeleteBusiness(id);
      await writeAuditLog({
        action: "SHOP_DELETED",
        actorType: "super_admin",
        actorId: session.superAdminId,
        targetType: "shop",
        targetId: id,
        shopId: id,
        ipAddress,
        userAgent,
        requestId,
      });
    }

    return NextResponse.json(shop);
  } catch (error) {
    return handleApiError(error);
  }
}
