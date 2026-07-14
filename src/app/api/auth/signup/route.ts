import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  hashPassword,
  signSession,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";
import { signupSchema } from "@/lib/validation/auth";
import { handleApiError } from "@/lib/api-utils";
import { createShopForAdmin } from "@/lib/services/shop";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = signupSchema.parse(body);
    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);

    const existing = await db.admin.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(input.password);
    const admin = await db.admin.create({
      data: { email: input.email, passwordHash },
    });
    const shop = await createShopForAdmin(admin.id, input);

    const token = await signSession({ adminId: admin.id, shopId: shop.id });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    await writeAuditLog({
      action: "ADMIN_SIGNUP",
      actorType: "admin",
      actorId: admin.id,
      targetType: "shop",
      targetId: shop.id,
      shopId: shop.id,
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ shopSlug: shop.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
