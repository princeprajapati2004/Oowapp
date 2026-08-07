import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { signupSchema } from "@/lib/validation/auth";
import { handleApiError } from "@/lib/api-utils";
import { createShopForAdmin } from "@/lib/services/shop";
import { createInitialSubscription } from "@/lib/services/subscription";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { sendVerificationOtp } from "@/lib/services/email-otp";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = signupSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const existing = await db.admin.findUnique({
      where: { email: input.email },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: { id: true, emailVerified: true } as any,
    });

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(existing as any).emailVerified) {
        // Allow resending OTP to an unverified account rather than blocking with an error
        return NextResponse.json(
          { pendingVerification: true, email: input.email },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(input.password);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = await (db.admin as any).create({
      data: { email: input.email, passwordHash, emailVerified: false },
    });
    const shop = await createShopForAdmin(admin.id, input);
    await createInitialSubscription(shop.id);

    await writeAuditLog({
      action: "ADMIN_SIGNUP",
      actorType: "admin",
      actorId: admin.id,
      targetType: "shop",
      targetId: shop.id,
      shopId: shop.id,
      metadata: { emailVerified: false },
      ipAddress,
      userAgent,
      requestId,
    });

    await writeAuditLog({
      action: "SUBSCRIPTION_CHANGED",
      actorType: "system",
      actorId: admin.id,
      targetType: "shop",
      targetId: shop.id,
      shopId: shop.id,
      metadata: { event: "trial_started", plan: "FREE" },
      ipAddress,
      userAgent,
      requestId,
    });

    // Extract a display name from the business name for the email greeting
    const displayName = input.businessName;
    await sendVerificationOtp(admin.id, input.email, displayName);

    return NextResponse.json({ pendingVerification: true, email: input.email });
  } catch (error) {
    return handleApiError(error);
  }
}
