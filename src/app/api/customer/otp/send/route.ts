import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendOtpSchema } from "@/lib/validation/phone-otp";
import {
  createOtp,
  secondsUntilNextSend,
  OTP_EXPIRY_MINUTES,
  RESEND_COOLDOWN_SECONDS,
} from "@/lib/services/phone-otp";
import { sendOtpSms } from "@/lib/services/sms-provider";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`otp-send:${ip}`, 10, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = sendOtpSchema.parse(body);

    const shop = await db.shop.findUnique({
      where: { slug: input.shopSlug },
      select: { id: true, businessName: true, requirePhone: true },
    });
    if (!shop) throw new NotFoundError("Shop not found");
    if (!shop.requirePhone) {
      return NextResponse.json(
        { error: "Phone verification isn't enabled for this shop" },
        { status: 400 }
      );
    }

    if (!checkRateLimit(`otp-send-phone:${shop.id}:${input.phone}`, 5, 15 * 60_000)) {
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

    const code = await createOtp(shop.id, input.phone);
    await sendOtpSms(input.phone, code, shop);

    return NextResponse.json({
      ok: true,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
