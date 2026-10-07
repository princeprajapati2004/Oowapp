import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE, SESSION_DURATION_SECONDS } from "@/lib/auth";
import { requireAdminSession, ForbiddenError } from "@/lib/session";
import { NotFoundError, handleApiError } from "@/lib/api-utils";
import { switchBusinessSchema } from "@/lib/validation/business";

// Re-signs the session cookie after verifying ownership — the same
// signSession() call site login already uses, just invoked a second time.
// This keeps every existing /api/admin/* route's trust in session.shopId
// unchanged: it's re-verified and re-signed here, not just at login.
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = switchBusinessSchema.parse(body);

    const shop = await db.shop.findUnique({ where: { id: input.shopId } });
    if (!shop) throw new NotFoundError("Business not found");
    if (shop.adminId !== session.adminId) {
      throw new ForbiddenError("This business does not belong to your account");
    }

    await db.admin.update({
      where: { id: session.adminId },
      data: { lastActiveShopId: shop.id },
    });

    const token = await signSession({ adminId: session.adminId, shopId: shop.id });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    return NextResponse.json({ shop });
  } catch (error) {
    return handleApiError(error);
  }
}
