import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SA_SESSION_COOKIE } from "@/lib/auth";
import { requireSuperAdminSession } from "@/lib/session";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdminSession();
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const cookieStore = await cookies();
    cookieStore.delete(SA_SESSION_COOKIE);

    await writeAuditLog({
      action: "SUPER_ADMIN_LOGOUT",
      actorType: "super_admin",
      actorId: session.superAdminId,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Always clear the cookie even if session was already invalid
    const cookieStore = await cookies();
    cookieStore.delete(SA_SESSION_COOKIE);
    return NextResponse.json({ ok: true });
  }
}
