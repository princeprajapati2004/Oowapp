import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyMsg91Otp, verifyMsg91SendToken, Msg91TokenError } from "@/lib/services/msg91-verify";
import {
  signPhoneVerified,
  PHONE_VERIFIED_COOKIE,
  PHONE_VERIFIED_DURATION_SECONDS,
} from "@/lib/phone-verify-auth";

const schema = z.object({
  shopSlug: z.string(),
  token: z.string().min(1),
  otp: z.string().trim().regex(/^\d{4,8}$/, "Enter the code"),
});

// Sets PHONE_VERIFIED_COOKIE after confirming the OTP with MSG91. `token`
// is the signed {reqId, phone, shopId} minted by send-msg91/route.ts; the
// phone this route trusts always comes from that token, never client input.
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`otp-verify-msg91:${ip}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    const payload = await verifyMsg91SendToken(input.token);
    if (!payload || payload.shopId !== shop.id) {
      throw new Msg91TokenError("This verification code has expired — please request a new one.");
    }

    await verifyMsg91Otp(payload.reqId, input.otp);

    const cookieToken = await signPhoneVerified({ shopId: shop.id, phone: payload.phone });
    const cookieStore = await cookies();
    cookieStore.set(PHONE_VERIFIED_COOKIE, cookieToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PHONE_VERIFIED_DURATION_SECONDS,
    });

    return NextResponse.json({ ok: true, phone: payload.phone });
  } catch (error) {
    if (error instanceof Msg91TokenError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return handleApiError(error);
  }
}
