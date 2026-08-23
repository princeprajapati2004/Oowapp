import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  signSession,
  verifyPendingRegistration,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  PENDING_REGISTRATION_COOKIE,
} from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { UnauthorizedError } from "@/lib/session";
import { businessDetailsSchema } from "@/lib/validation/auth";
import { createShopForAdmin } from "@/lib/services/shop";
import { createInitialSubscription } from "@/lib/services/subscription";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PENDING_REGISTRATION_COOKIE)?.value;
    const pending = pendingToken ? await verifyPendingRegistration(pendingToken) : null;
    if (!pending) {
      throw new UnauthorizedError("Your registration session has expired. Please start again.");
    }

    const admin = await db.admin.findUnique({ where: { id: pending.adminId }, include: { shop: true } });
    if (!admin || !admin.emailVerified) {
      throw new UnauthorizedError("Please verify your email first.");
    }

    const body = await request.json();
    const input = businessDetailsSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    // Already has a shop (e.g. a retried submit) — just log them in instead
    // of erroring or creating a second shop for the same admin.
    let shop = admin.shop;
    if (!shop) {
      shop = await createShopForAdmin(admin.id, {
        businessName: input.businessName,
        businessType: input.businessType,
        whatsappNumber: admin.phone ?? "",
      });
      await createInitialSubscription(shop.id);

      await writeAuditLog({
        action: "ADMIN_SIGNUP",
        actorType: "admin",
        actorId: admin.id,
        targetType: "shop",
        targetId: shop.id,
        shopId: shop.id,
        metadata: { step: "business_details_completed" },
        ipAddress,
        userAgent,
        requestId,
      });

      await writeAuditLog({
        action: "SUBSCRIPTION_CHANGED",
        actorType: "system",
        actorId: admin.id,
        targetType: "shop",
        targetId: shop.id,
        shopId: shop.id,
        metadata: { event: "trial_started", plan: "FREE" },
        ipAddress,
        userAgent,
        requestId,
      });
    }

    const token = await signSession({ adminId: admin.id, shopId: shop.id });
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
    cookieStore.delete(PENDING_REGISTRATION_COOKIE);

    return NextResponse.json({ ok: true, shopSlug: shop.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
