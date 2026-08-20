import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyFirebasePhoneToken, FirebaseTokenError } from "@/lib/services/firebase-verify";
import {
  hashCustomerPassword,
  signCustomerSession,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_SECONDS,
} from "@/lib/customer-auth";
import { linkGuestOrdersToCustomer } from "@/lib/link-guest-orders";

const schema = z.object({
  shopSlug: z.string(),
  idToken: z.string().min(1),
});

/**
 * Customer login via Firebase Phone Auth — the counterpart to the existing
 * password-based /login and /signup routes, reusing the exact same Customer
 * model and CUSTOMER_SESSION_COOKIE rather than a second, parallel identity
 * system. Customer.id (not the Firebase UID) stays what Order.customerId and
 * every ownership check already depends on; accounts are found/created by
 * (shopId, phone) — this app's existing uniqueness — so a repeat OTP login
 * always resolves to the same account, and an existing password-signup
 * account can also log in via OTP once its phone number matches.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`customer-auth-otp:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
    const phone = await verifyFirebasePhoneToken(input.idToken, projectId);

    if (!checkRateLimit(`customer-auth-otp-phone:${shop.id}:${phone}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Identity is keyed on the verified phone number (this app's existing
    // shopId+phone uniqueness) — not the Firebase UID — so this naturally
    // finds a password-signup account too if the phone matches, and never
    // creates a duplicate for a repeat OTP login. firebaseUid is kept purely
    // for reference (extracted from the already-verified token's own `sub`
    // claim, not re-checked — the signature was already validated above).
    let customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone } },
    });
    const firebaseUid = await extractSubject(input.idToken);

    if (!customer) {
      // First time this phone has ever ordered from this shop as a logged-in
      // customer — create the account. No password is usable for it (OTP is
      // the only way in), but passwordHash is a required column, so store an
      // unguessable random hash rather than leaving it predictable/blank.
      const randomPassword = crypto.randomBytes(24).toString("hex");
      const passwordHash = await hashCustomerPassword(randomPassword);
      customer = await db.customer.create({
        data: { shopId: shop.id, name: "Guest", phone, passwordHash, firebaseUid },
      });
    } else if (customer.firebaseUid !== firebaseUid) {
      customer = await db.customer.update({ where: { id: customer.id }, data: { firebaseUid } });
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
    if (error instanceof FirebaseTokenError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return handleApiError(error);
  }
}

// Firebase ID tokens carry the UID in the standard JWT `sub` claim — decoded
// here (not re-verified, verifyFirebasePhoneToken already did that) purely
// to persist it on the Customer row for reference.
async function extractSubject(idToken: string): Promise<string | null> {
  try {
    const payloadSegment = idToken.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
