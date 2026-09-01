import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { updateShopSettings } from "@/lib/services/shop";
import { onboardingProfileSchema } from "@/lib/validation/onboarding";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const [admin, shop] = await Promise.all([
      db.admin.findUnique({ where: { id: session.adminId }, select: { email: true } }),
      db.shop.findUnique({
        where: { id: session.shopId },
        select: {
          businessName: true,
          whatsappNumber: true,
          onboardingCompleted: true,
          ownerName: true,
          address: true,
          city: true,
          state: true,
          country: true,
          pincode: true,
          gstNumber: true,
          currency: true,
          timezone: true,
        },
      }),
    ]);
    if (!admin || !shop) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({
      email: admin.email,
      onboardingCompleted: shop.onboardingCompleted,
      businessName: shop.businessName,
      whatsappNumber: shop.whatsappNumber,
      profile: {
        ownerName: shop.ownerName ?? "",
        address: shop.address ?? "",
        city: shop.city ?? "",
        state: shop.state ?? "",
        country: shop.country ?? "India",
        pincode: shop.pincode ?? "",
        gstNumber: shop.gstNumber ?? "",
        currency: shop.currency,
        timezone: shop.timezone ?? "Asia/Kolkata",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();

    const body = await request.json();
    const input = onboardingProfileSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const shop = await updateShopSettings(session.shopId, {
      ownerName: input.ownerName,
      address: input.address,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      country: input.country || "India",
      gstNumber: input.gstNumber || null,
      currency: input.currency || undefined,
      timezone: input.timezone || "Asia/Kolkata",
      onboardingCompleted: true,
    });

    await writeAuditLog({
      action: "ONBOARDING_COMPLETED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "shop",
      targetId: shop.id,
      shopId: shop.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true, shopSlug: shop.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
