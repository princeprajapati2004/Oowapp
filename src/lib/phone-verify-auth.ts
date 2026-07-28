import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// Reuses the same secret and trust boundary as the password-based Customer
// session (src/lib/customer-auth.ts) — both live on the same public,
// customer-facing surface. This is a separate, lighter-weight token though:
// it only proves "this browser verified this phone via OTP for this shop
// recently," not a full account login.
const CUSTOMER_JWT_SECRET = new TextEncoder().encode(
  process.env.CUSTOMER_JWT_SECRET ?? "insecure-dev-customer-secret"
);

export const PHONE_VERIFIED_COOKIE = "phone_verified";
export const PHONE_VERIFIED_DURATION_SECONDS = 60 * 60 * 12; // 12 hours — long enough for one dining session

interface PhoneVerifiedPayload {
  shopId: string;
  phone: string;
}

export async function signPhoneVerified(payload: PhoneVerifiedPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PHONE_VERIFIED_DURATION_SECONDS}s`)
    .sign(CUSTOMER_JWT_SECRET);
}

async function verifyPhoneVerifiedToken(token: string): Promise<PhoneVerifiedPayload | null> {
  try {
    const { payload } = await jwtVerify(token, CUSTOMER_JWT_SECRET);
    if (typeof payload.shopId === "string" && typeof payload.phone === "string") {
      return { shopId: payload.shopId, phone: payload.phone };
    }
    return null;
  } catch {
    return null;
  }
}

/** Server-side read for pages/layouts — returns the verified phone for this shop, or null. */
export async function getVerifiedPhone(shopId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PHONE_VERIFIED_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyPhoneVerifiedToken(token);
  if (!payload || payload.shopId !== shopId) return null;
  return payload.phone;
}

/** Route-handler read for enforcing verification on order submission — returns the payload or null. */
export async function readPhoneVerifiedCookie(): Promise<PhoneVerifiedPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PHONE_VERIFIED_COOKIE)?.value;
  if (!token) return null;
  return verifyPhoneVerifiedToken(token);
}
