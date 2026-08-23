import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const REFERRAL_COOKIE = "referral_code";
export const REFERRAL_COOKIE_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days — set by src/proxy.ts

/** Reads the referral-code cookie set by proxy.ts from `?ref=CODE`, if any. */
export async function getReferralCookieCode(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFERRAL_COOKIE)?.value ?? null;
}

/**
 * Best-effort — called right after a new Customer account is created (both
 * password signup and OTP auto-create in login-otp). Never throws: a
 * referral-attribution hiccup must not block account creation. An explicit
 * code (typed into the signup form) wins over the cookie (set by browsing a
 * `?ref=` link before signing up).
 */
export async function attributeReferral(
  shopId: string,
  newCustomerId: string,
  explicitCode?: string | null
): Promise<void> {
  try {
    const cookieCode = explicitCode ? null : await getReferralCookieCode();
    const code = (explicitCode || cookieCode)?.trim().toUpperCase();
    if (!code) return;

    const referrer = await db.customer.findUnique({
      where: { shopId_referralCode: { shopId, referralCode: code } },
    });
    // Self-referral is already structurally near-impossible (a phone number
    // can only ever create one Customer row per shop), but stays defensive.
    if (!referrer || referrer.id === newCustomerId) return;

    await db.referral.create({
      data: { shopId, referrerCustomerId: referrer.id, referredCustomerId: newCustomerId },
    });
  } catch {
    // Referral attribution is a nice-to-have — never let it break signup/login.
  }
}
