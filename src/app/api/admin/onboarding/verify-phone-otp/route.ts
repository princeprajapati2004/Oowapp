import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { verifyAdminPhoneOtp } from "@/lib/services/admin-phone-otp";
import { verifyAdminPhoneOtpSchema } from "@/lib/validation/onboarding";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`admin-phone-otp-verify:${ip}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = verifyAdminPhoneOtpSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    // verifyAdminPhoneOtp itself flips Admin.phoneVerified server-side on
    // success — never trust a "verified" claim from the client.
    await verifyAdminPhoneOtp(session.adminId, input.otp);

    await writeAuditLog({
      action: "PHONE_VERIFIED",
      actorType: "admin",
      actorId: session.adminId,
      shopId: session.shopId,
      ipAddress,
      userAgent,
      requestId,
    });

    const admin = await db.admin.findUnique({ where: { id: session.adminId }, select: { phoneVerified: true } });
    return NextResponse.json({ ok: true, phoneVerified: admin?.phoneVerified ?? true });
  } catch (error) {
    return handleApiError(error);
  }
}
