import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// Deliberately a separate secret from JWT_SECRET/SA_JWT_SECRET — customer
// accounts sit on the most publicly exposed surface of the app, so a
// compromised secret here shouldn't also compromise admin or super-admin
// sessions (same isolation principle those two already use between them).
const CUSTOMER_JWT_SECRET = new TextEncoder().encode(
  process.env.CUSTOMER_JWT_SECRET ?? "insecure-dev-customer-secret"
);

export const CUSTOMER_SESSION_COOKIE = "customer_session";
export const CUSTOMER_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface CustomerSessionPayload {
  customerId: string;
  shopId: string;
  role: "customer";
}

export function hashCustomerPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyCustomerPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signCustomerSession(payload: Omit<CustomerSessionPayload, "role">) {
  return new SignJWT({ ...payload, role: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CUSTOMER_SESSION_DURATION_SECONDS}s`)
    .sign(CUSTOMER_JWT_SECRET);
}

export async function verifyCustomerSession(token: string): Promise<CustomerSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, CUSTOMER_JWT_SECRET);
    if (typeof payload.customerId === "string" && typeof payload.shopId === "string") {
      return { customerId: payload.customerId, shopId: payload.shopId, role: "customer" };
    }
    return null;
  } catch {
    return null;
  }
}
