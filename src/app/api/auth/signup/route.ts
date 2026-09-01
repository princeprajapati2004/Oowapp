import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerStartSchema } from "@/lib/validation/auth";
import { handleApiError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { sendVerificationOtp } from "@/lib/services/email-otp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`register-start:${ip}`, 8, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const input = registerStartSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const existing = await db.admin.findUnique({
      where: { email: input.email },
      select: { id: true, emailVerified: true, shop: { select: { id: true } } },
    });

    if (existing) {
      if (existing.emailVerified && existing.shop) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please log in instead." },
          { status: 409 }
        );
      }
      // Unverified / mid-registration account — let them resume instead of
      // erroring, re-sending a fresh OTP to the (possibly updated) phone.
      await db.admin.update({ where: { id: existing.id }, data: { phone: input.phone } });
      await sendVerificationOtp(existing.id, input.email, "");
      return NextResponse.json({ pendingVerification: true, email: input.email });
    }

    const admin = await db.admin.create({
      data: { email: input.email, phone: input.phone, emailVerified: false },
    });

    await writeAuditLog({
      action: "ADMIN_SIGNUP",
      actorType: "admin",
      actorId: admin.id,
      metadata: { step: "registration_started" },
      ipAddress,
      userAgent,
      requestId,
    });

    await sendVerificationOtp(admin.id, input.email, "");

    return NextResponse.json({ pendingVerification: true, email: input.email });
  } catch (error) {
    return handleApiError(error);
  }
}
