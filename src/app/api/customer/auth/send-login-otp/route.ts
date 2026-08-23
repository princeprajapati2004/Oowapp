import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendOtpSchema } from "@/lib/validation/phone-otp";
import { startOtp, secondsUntilNextSend, OTP_EXPIRY_MINUTES, RESEND_COOLDOWN_SECONDS } from "@/lib/services/phone-otp";

// Counterpart to /api/customer/otp/send for the login flow — same OTP engine
// (phone-otp.ts + sms-provider.ts), but not gated on shop.requirePhone: a
// shop can offer OTP login regardless of whether checkout itself collects
// a phone number.
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`login-otp-send:${ip}`, 10, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = sendOtpSchema.parse(body);

    const shop = await db.shop.findUnique({
      where: { slug: input.shopSlug },
      select: { id: true, businessName: true },
    });
    if (!shop) throw new NotFoundError("Shop not found");

    if (!checkRateLimit(`login-otp-send-phone:${shop.id}:${input.phone}`, 5, 15 * 60_000)) {
      return NextResponse.json(
        { error: "Too many codes requested for this number — please wait a while." },
        { status: 429 }
      );
    }

    const cooldown = await secondsUntilNextSend(shop.id, input.phone);
    if (cooldown > 0) {
      return NextResponse.json(
        { error: `Please wait ${cooldown}s before requesting another code.` },
        { status: 429 }
      );
    }

    await startOtp(shop.id, input.phone, shop);

    return NextResponse.json({
      ok: true,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
