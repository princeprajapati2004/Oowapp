import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyMsg91Otp, verifyMsg91SendToken, Msg91TokenError } from "@/lib/services/msg91-verify";
import {
  hashCustomerPassword,
  signCustomerSession,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_SECONDS,
} from "@/lib/customer-auth";
import { linkGuestOrdersToCustomer } from "@/lib/link-guest-orders";

const schema = z.object({
  shopSlug: z.string(),
  token: z.string().min(1),
  otp: z.string().trim().regex(/^\d{4,8}$/, "Enter the code"),
});

/**
 * Customer login via MSG91 OTP — counterpart to the password-based /login
 * route, reusing the same Customer model and CUSTOMER_SESSION_COOKIE rather
 * than a second identity system. Accounts are found/created by the phone
 * number carried in the signed send-msg91 token (never client input), so a
 * repeat OTP login always resolves to the same account and an existing
 * password-signup account can also log in via OTP once its phone matches.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`customer-auth-otp-msg91:${ip}`, 10, 60_000)) {
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
    const phone = payload.phone;

    if (!checkRateLimit(`customer-auth-otp-msg91-phone:${shop.id}:${phone}`, 10, 60_000)) {
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
    if (error instanceof Msg91TokenError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return handleApiError(error);
  }
}
