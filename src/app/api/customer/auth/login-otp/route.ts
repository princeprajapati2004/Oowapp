import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOtpSchema } from "@/lib/validation/phone-otp";
import { verifyOtp } from "@/lib/services/phone-otp";
import {
  hashCustomerPassword,
  signCustomerSession,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_SECONDS,
} from "@/lib/customer-auth";
import { linkGuestOrdersToCustomer } from "@/lib/link-guest-orders";
import { attributeReferral } from "@/lib/referral-attribution";

/**
 * Customer login via OTP — counterpart to the password-based /login route,
 * reusing the same Customer model and CUSTOMER_SESSION_COOKIE rather than a
 * second identity system. Accounts are found/created by (shopId, phone) —
 * this app's existing uniqueness — so a repeat OTP login always resolves to
 * the same account and an existing password-signup account can also log in
 * via OTP once its phone matches. Verification itself goes through the same
 * engine as checkout (phone-otp.ts), so the phone number is only ever
 * trusted after verifyOtp() succeeds — never taken on faith from the client.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`customer-auth-otp:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = verifyOtpSchema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    await verifyOtp(shop.id, input.phone, input.code);
    const phone = input.phone;

    if (!checkRateLimit(`customer-auth-otp-phone:${shop.id}:${phone}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone } },
    });

    if (!customer) {
      // First time this phone has ever logged in for this shop — create the
      // account. No password is usable for it (OTP is the only way in), but
      // passwordHash is a required column, so store an unguessable random
      // hash rather than leaving it predictable/blank.
      const randomPassword = crypto.randomBytes(24).toString("hex");
      const passwordHash = await hashCustomerPassword(randomPassword);
      customer = await db.customer.create({
        data: { shopId: shop.id, name: "Guest", phone, passwordHash },
      });
      // Only a genuinely new account can be a referral's "referred" side —
      // an existing account logging in again isn't a new attribution event.
      await attributeReferral(shop.id, customer.id);
    }

    await linkGuestOrdersToCustomer(shop.id, customer.id, phone);

    const token = await signCustomerSession({ customerId: customer.id, shopId: shop.id });
    const cookieStore = await cookies();
    cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CUSTOMER_SESSION_DURATION_SECONDS,
    });

    return NextResponse.json({ ok: true, name: customer.name });
  } catch (error) {
    return handleApiError(error);
  }
}
