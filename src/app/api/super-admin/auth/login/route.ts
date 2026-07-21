import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  verifyPassword,
  signSuperAdminSession,
  SA_SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const superAdmin = await db.superAdmin.findUnique({ where: { email } });
    if (!superAdmin || !(await verifyPassword(password, superAdmin.passwordHash))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await db.superAdmin.update({
      where: { id: superAdmin.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signSuperAdminSession({ superAdminId: superAdmin.id });
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
      actorId: superAdmin.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
