import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { verifyPassword } from "@/lib/auth";
import { signStaffSession, STAFF_SESSION_COOKIE, STAFF_SESSION_DURATION_SECONDS } from "@/lib/staff-auth";

const loginSchema = z.object({
  shopSlug: z.string().trim().min(1),
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shopSlug, email, password } = loginSchema.parse(body);

    const shop = await db.shop.findUnique({
      where: { slug: shopSlug },
      select: { id: true, slug: true, status: true },
    });
    if (!shop || shop.status !== "ACTIVE") {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = await (db as any).staffMember.findFirst({
      where: { shopId: shop.id, email, isActive: true },
    });
    if (!staff || !(await verifyPassword(password, staff.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).staffMember.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signStaffSession({
      staffId: staff.id,
      shopId: shop.id,
      shopSlug: shop.slug,
      role: staff.role,
      name: staff.name,
    });

    const cookieStore = await cookies();
    cookieStore.set(STAFF_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: STAFF_SESSION_DURATION_SECONDS,
      path: "/",
    });

    return NextResponse.json({ ok: true, role: staff.role, shopSlug: shop.slug });
  } catch (error) {
    return handleApiError(error);
  }
}
