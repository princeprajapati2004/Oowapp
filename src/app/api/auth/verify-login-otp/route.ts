import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE, SESSION_DURATION_SECONDS } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { verifyLoginOtpSchema } from "@/lib/validation/auth";
import { verifyOtp } from "@/lib/services/email-otp";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { pickActiveShop } from "@/lib/services/shop";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`verify-login-otp:${ip}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = verifyLoginOtpSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const admin = await db.admin.findUnique({
      where: { email: input.email },
      include: { shops: true },
    });

    if (!admin) {
      return NextResponse.json(
        { error: "Your account does not exist. Please set up your shop first with registration." },
        { status: 400 }
      );
    }

    const activeShop = pickActiveShop(admin.shops, admin.lastActiveShopId);

    if (!activeShop) {
      return NextResponse.json(
        { error: "Your account does not exist. Please set up your shop first with registration." },
        { status: 400 }
      );
    }

    if (!admin.emailVerified) {
      return NextResponse.json({ error: "Please verify your email before logging in." }, { status: 400 });
    }

    const result = await verifyOtp(admin.id, "LOGIN", input.otp);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await db.shop.update({ where: { id: activeShop.id }, data: { lastLoginAt: new Date() } });
    if (admin.lastActiveShopId !== activeShop.id) {
      await db.admin.update({ where: { id: admin.id }, data: { lastActiveShopId: activeShop.id } });
    }

    const token = await signSession({ adminId: admin.id, shopId: activeShop.id });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    await writeAuditLog({
      action: "ADMIN_LOGIN",
      actorType: "admin",
      actorId: admin.id,
      shopId: activeShop.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ shopSlug: activeShop.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
