import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
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

    const validEmail = process.env.SUPER_ADMIN_SEED_EMAIL;
    const validPassword = process.env.SUPER_ADMIN_SEED_PASSWORD;

    if (
      !validEmail ||
      !validPassword ||
      email !== validEmail ||
      password !== validPassword
    ) {
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
