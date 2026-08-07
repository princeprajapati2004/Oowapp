import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { sendVerificationOtp, sendPasswordResetOtp, canResendOtp } from "@/lib/services/email-otp";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(["SIGNUP", "PASSWORD_RESET"]).default("SIGNUP"),
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
      select: { id: true, email: true, emailVerified: true, shop: { select: { businessName: true } } },
    });

    // Return success even if account doesn't exist (prevent enumeration)
    if (!admin) {
      return NextResponse.json({ ok: true });
    }

    if (input.purpose === "SIGNUP" && admin.emailVerified) {
      return NextResponse.json({ error: "This email is already verified." }, { status: 400 });
    }

    const allowed = await canResendOtp(admin.id, input.purpose);
    if (!allowed) {
      return NextResponse.json(
        { error: "Please wait 30 seconds before requesting a new code." },
        { status: 429 }
      );
    }

    const name = admin.shop?.businessName ?? "";
    if (input.purpose === "SIGNUP") {
      await sendVerificationOtp(admin.id, admin.email, name);
    } else {
      await sendPasswordResetOtp(admin.id, admin.email, name);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
