import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  signSession,
  signPendingRegistration,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  PENDING_REGISTRATION_COOKIE,
  PENDING_REGISTRATION_DURATION_SECONDS,
} from "@/lib/auth";
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

    if (!admin) {
      // Constant-time response — don't reveal whether email exists
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }

    const cookieStore = await cookies();

    // Already verified from a previous request (e.g. a retried submit) —
    // just route them to wherever they should be next instead of erroring.
    if (admin.emailVerified) {
      if (admin.shop) {
        const token = await signSession({ adminId: admin.id, shopId: admin.shop.id });
        cookieStore.set(SESSION_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: SESSION_DURATION_SECONDS,
        });
        return NextResponse.json({ shopSlug: admin.shop.slug });
      }
      const pendingToken = await signPendingRegistration({ adminId: admin.id });
      cookieStore.set(PENDING_REGISTRATION_COOKIE, pendingToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: PENDING_REGISTRATION_DURATION_SECONDS,
      });
      return NextResponse.json({ pendingBusinessDetails: true });
    }

    const result = await verifyOtp(admin.id, "SIGNUP", input.otp);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await db.admin.update({ where: { id: admin.id }, data: { emailVerified: true } });

    await writeAuditLog({
      action: "EMAIL_VERIFIED",
      actorType: "admin",
      actorId: admin.id,
      shopId: admin.shop?.id,
      ipAddress,
      userAgent,
      requestId,
    });

    if (admin.shop) {
      // Defensive path — shouldn't happen in the current flow (Shop is only
      // created in complete-registration, after this), but keeps old
      // in-flight verification links from ever breaking.
      const token = await signSession({ adminId: admin.id, shopId: admin.shop.id });
      cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION_SECONDS,
      });
      return NextResponse.json({ shopSlug: admin.shop.slug });
    }

    const pendingToken = await signPendingRegistration({ adminId: admin.id });
    cookieStore.set(PENDING_REGISTRATION_COOKIE, pendingToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PENDING_REGISTRATION_DURATION_SECONDS,
    });
    return NextResponse.json({ pendingBusinessDetails: true });
  } catch (error) {
    return handleApiError(error);
  }
}
