import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { sendLoginOtpSchema } from "@/lib/validation/auth";
import { sendLoginOtp, canResendOtp } from "@/lib/services/email-otp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`send-login-otp:${ip}`, 8, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const input = sendLoginOtpSchema.parse(body);

    const admin = await db.admin.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, emailVerified: true, shop: { select: { id: true, businessName: true } } },
    });

    if (!admin || !admin.shop) {
      return NextResponse.json(
        { error: "Your account does not exist. Please set up your shop first with registration." },
        { status: 400 }
      );
    }

    if (!admin.emailVerified) {
      return NextResponse.json(
        { error: "Please verify your email before logging in." },
        { status: 400 }
      );
    }

    const allowed = await canResendOtp(admin.id, "LOGIN");
    if (!allowed) {
      return NextResponse.json(
        { error: "Please wait 30 seconds before requesting a new code." },
        { status: 429 }
      );
    }

    await sendLoginOtp(admin.id, admin.email, admin.shop.businessName);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
