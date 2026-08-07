import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { sendPasswordResetOtp, canResendOtp } from "@/lib/services/email-otp";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`forgot-password:${ip}`, 5, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);

    // Always return success regardless of whether the email exists (prevent enumeration)
    const admin = await db.admin.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, shop: { select: { businessName: true } } },
    });

    if (admin) {
      const allowed = await canResendOtp(admin.id, "PASSWORD_RESET");
      if (allowed) {
        const name = admin.shop?.businessName ?? "";
        await sendPasswordResetOtp(admin.id, admin.email, name);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
