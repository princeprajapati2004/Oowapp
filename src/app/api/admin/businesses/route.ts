import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { addBusinessSchema } from "@/lib/validation/business";
import { createShopForAdmin, listShopsForAdmin } from "@/lib/services/shop";
import { checkSubscriptionLimit } from "@/lib/services/subscription-limits";
import { db } from "@/lib/db";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const shops = await listShopsForAdmin(session.adminId);
    return NextResponse.json({ shops });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    await checkSubscriptionLimit(session.adminId, "BUSINESSES", 1);
    const body = await request.json();
    const input = addBusinessSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const shop = await createShopForAdmin(session.adminId, input);
    await db.admin.update({
      where: { id: session.adminId },
      data: { lastActiveShopId: shop.id },
    });

    await writeAuditLog({
      action: "SHOP_CREATED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "shop",
      targetId: shop.id,
      shopId: shop.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ shop });
  } catch (error) {
    return handleApiError(error);
  }
}
