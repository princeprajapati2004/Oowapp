import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE, SESSION_DURATION_SECONDS } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { verifyOtp } from "@/lib/services/email-otp";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`verify-email:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const admin = await db.admin.findUnique({
      where: { email: input.email },
      include: { shop: true },
    });

    if (!admin || !admin.shop) {
      // Constant-time response — don't reveal whether email exists
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((admin as any).emailVerified) {
      // Already verified — issue session and let them in
      const token = await signSession({ adminId: admin.id, shopId: admin.shop.id });
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION_SECONDS,
      });
      return NextResponse.json({ shopSlug: admin.shop.slug });
    }

    const result = await verifyOtp(admin.id, "SIGNUP", input.otp);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Mark email as verified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.admin as any).update({
      where: { id: admin.id },
      data: { emailVerified: true },
    });

    // Issue session — account is now active
    const token = await signSession({ adminId: admin.id, shopId: admin.shop.id });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    await writeAuditLog({
      action: "EMAIL_VERIFIED",
      actorType: "admin",
      actorId: admin.id,
      shopId: admin.shop.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ shopSlug: admin.shop.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
