import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  verifyPassword,
  signSession,
  signSuperAdminSession,
  SESSION_COOKIE,
  SA_SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validation/auth";
import { handleApiError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const SA_EMAIL = process.env.SUPER_ADMIN_SEED_EMAIL;
    const SA_PASSWORD = process.env.SUPER_ADMIN_SEED_PASSWORD;

    // Super Admin path — checked first, exclusively by email match
    if (SA_EMAIL && input.email === SA_EMAIL) {
      if (!SA_PASSWORD || input.password !== SA_PASSWORD) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const token = await signSuperAdminSession({ superAdminId: "platform-owner" });
      const cookieStore = await cookies();
      cookieStore.set(SA_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION_SECONDS,
      });

      await writeAuditLog({
        action: "SUPER_ADMIN_LOGIN",
        actorType: "super_admin",
        actorId: "platform-owner",
        ipAddress,
        userAgent,
        requestId,
      });

      return NextResponse.json({ role: "super_admin" });
    }

    // Business Admin path
    const admin = await db.admin.findUnique({
      where: { email: input.email },
      include: { shop: true },
    });

    if (!admin || !admin.shop) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await verifyPassword(input.password, admin.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await db.shop.update({
      where: { id: admin.shop.id },
      data: { lastLoginAt: new Date() },
    });

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
      action: "ADMIN_LOGIN",
      actorType: "admin",
      actorId: admin.id,
      shopId: admin.shop.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ role: "business_admin", shopSlug: admin.shop.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
