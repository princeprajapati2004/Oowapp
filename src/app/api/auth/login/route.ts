import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  verifyPassword,
  signSession,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validation/auth";
import { handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    const admin = await db.admin.findUnique({
      where: { email: input.email },
      include: { shop: true },
    });

    if (!admin || !admin.shop) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(input.password, admin.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

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
  } catch (error) {
    return handleApiError(error);
  }
}
