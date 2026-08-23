import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import {
  startAdminPhoneOtp,
  secondsUntilNextAdminResend,
  OTP_EXPIRY_MINUTES,
  RESEND_COOLDOWN_SECONDS,
} from "@/lib/services/admin-phone-otp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`admin-phone-otp-send:${ip}`, 5, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    if (!checkRateLimit(`admin-phone-otp-send:${session.adminId}`, 5, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many codes requested — please wait a while." }, { status: 429 });
    }

    const [admin, shop] = await Promise.all([
      db.admin.findUnique({ where: { id: session.adminId } }),
      db.shop.findUnique({ where: { id: session.shopId }, select: { whatsappNumber: true, businessName: true } }),
    ]);
    if (!admin || !shop) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (admin.phoneVerified) {
      return NextResponse.json({ error: "Your mobile number is already verified." }, { status: 400 });
    }

    const cooldown = await secondsUntilNextAdminResend(session.adminId);
    if (cooldown > 0) {
      return NextResponse.json(
        { error: `Please wait ${cooldown}s before requesting another code.` },
        { status: 429 }
      );
    }

    await startAdminPhoneOtp(session.adminId, shop.whatsappNumber, shop.businessName);

    return NextResponse.json({
      ok: true,
      phone: shop.whatsappNumber,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
