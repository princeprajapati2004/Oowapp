import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyFirebasePhoneToken, FirebaseTokenError } from "@/lib/services/firebase-verify";
import {
  signPhoneVerified,
  PHONE_VERIFIED_COOKIE,
  PHONE_VERIFIED_DURATION_SECONDS,
} from "@/lib/phone-verify-auth";

const schema = z.object({
  shopSlug: z.string(),
  idToken: z.string().min(1),
});

// Counterpart to /api/customer/otp/verify for shops using Firebase Phone
// Auth instead of the DB-backed OTP flow (see PhoneVerification.tsx) — same
// end result (the PHONE_VERIFIED_COOKIE), different proof: a Firebase ID
// token verified against Google's public JWKS instead of a code hash.
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`otp-verify-firebase:${ip}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
    const phone = await verifyFirebasePhoneToken(input.idToken, projectId);

    const token = await signPhoneVerified({ shopId: shop.id, phone });
    const cookieStore = await cookies();
    cookieStore.set(PHONE_VERIFIED_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PHONE_VERIFIED_DURATION_SECONDS,
    });

    return NextResponse.json({ ok: true, phone });
  } catch (error) {
    if (error instanceof FirebaseTokenError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return handleApiError(error);
  }
}
