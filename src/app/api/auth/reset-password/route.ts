import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { verifyOtp } from "@/lib/services/email-otp";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Include at least one uppercase letter")
    .regex(/[0-9]/, "Include at least one number"),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`reset-password:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const admin = await db.admin.findUnique({
      where: { email: input.email },
      select: { id: true, shop: { select: { id: true } } },
    });

    if (!admin) {
      // Constant-time response
      return NextResponse.json({ error: "Invalid or expired reset code." }, { status: 400 });
    }

    const result = await verifyOtp(admin.id, "PASSWORD_RESET", input.otp);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const passwordHash = await hashPassword(input.newPassword);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.admin as any).update({
      where: { id: admin.id },
      data: { passwordHash, emailVerified: true },
    });

    await writeAuditLog({
      action: "PASSWORD_RESET_COMPLETED",
      actorType: "admin",
      actorId: admin.id,
      shopId: admin.shop?.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
