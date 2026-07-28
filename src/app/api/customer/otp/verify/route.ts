import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOtpSchema } from "@/lib/validation/phone-otp";
import { verifyOtp } from "@/lib/services/phone-otp";
import {
  signPhoneVerified,
  PHONE_VERIFIED_COOKIE,
  PHONE_VERIFIED_DURATION_SECONDS,
} from "@/lib/phone-verify-auth";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`otp-verify:${ip}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = verifyOtpSchema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    await verifyOtp(shop.id, input.phone, input.code);

    const token = await signPhoneVerified({ shopId: shop.id, phone: input.phone });
    const cookieStore = await cookies();
    cookieStore.set(PHONE_VERIFIED_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PHONE_VERIFIED_DURATION_SECONDS,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
