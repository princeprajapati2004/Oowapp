import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { sendVerificationOtp, canResendOtp } from "@/lib/services/email-otp";
import { checkRateLimit } from "@/lib/rate-limit";

// Resends the registration (step-1 email verification) code — see
// /verify-email. Login codes are resent via /api/auth/send-login-otp
// instead, which already has its own cooldown handling.
const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // Strict rate limit for resend — 5 per IP per 10 minutes
    if (!checkRateLimit(`resend-otp:${ip}`, 5, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);

    const admin = await db.admin.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, emailVerified: true },
    });

    // Return success even if account doesn't exist (prevent enumeration)
    if (!admin) {
      return NextResponse.json({ ok: true });
    }

    if (admin.emailVerified) {
      return NextResponse.json({ error: "This email is already verified." }, { status: 400 });
    }

    const allowed = await canResendOtp(admin.id, "SIGNUP");
    if (!allowed) {
      return NextResponse.json(
        { error: "Please wait 30 seconds before requesting a new code." },
        { status: 429 }
      );
    }

    await sendVerificationOtp(admin.id, admin.email, "");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
