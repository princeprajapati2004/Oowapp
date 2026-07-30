import { SignJWT, jwtVerify } from "jose";
import type { StaffRole } from "@/generated/prisma/client";

const STAFF_JWT_SECRET = new TextEncoder().encode(
  process.env.STAFF_JWT_SECRET ?? "insecure-dev-staff-secret"
);

export const STAFF_SESSION_COOKIE = "staff_session";
export const STAFF_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface StaffSessionPayload {
  staffId: string;
  shopId: string;
  shopSlug: string;
  role: StaffRole;
  name: string;
}

export function signStaffSession(payload: StaffSessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STAFF_SESSION_DURATION_SECONDS}s`)
    .sign(STAFF_JWT_SECRET);
}

export async function verifyStaffSession(token: string): Promise<StaffSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, STAFF_JWT_SECRET);
    if (
      typeof payload.staffId === "string" &&
      typeof payload.shopId === "string" &&
      typeof payload.shopSlug === "string" &&
      typeof payload.role === "string" &&
      typeof payload.name === "string"
    ) {
      return {
        staffId: payload.staffId,
        shopId: payload.shopId,
        shopSlug: payload.shopSlug,
        role: payload.role as StaffRole,
        name: payload.name,
      };
    }
    return null;
  } catch {
    return null;
  }
}
