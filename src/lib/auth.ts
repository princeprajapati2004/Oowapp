import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "insecure-dev-secret"
);

const SA_JWT_SECRET = new TextEncoder().encode(
  process.env.SA_JWT_SECRET ?? "insecure-dev-sa-secret"
);

export const SESSION_COOKIE = "session";
export const SA_SESSION_COOKIE = "sa_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Bridges the gap between "email verified" and "business details submitted"
// during registration — a real SessionPayload can't be issued yet (it
// requires a shopId, and no Shop exists until complete-registration creates
// one). Deliberately a distinct role/shape from SessionPayload so it can
// never be mistaken for — or reused as — a real signed-in session.
export const PENDING_REGISTRATION_COOKIE = "pending_reg";
export const PENDING_REGISTRATION_DURATION_SECONDS = 60 * 30; // 30 minutes

export interface PendingRegistrationPayload {
  adminId: string;
  role: "pending_registration";
}

export interface SessionPayload {
  adminId: string;
  shopId: string;
  role: "business_admin";
}

export interface SuperAdminSessionPayload {
  superAdminId: string;
  role: "super_admin";
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signSession(payload: Omit<SessionPayload, "role">) {
  return new SignJWT({ ...payload, role: "business_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(JWT_SECRET);
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (
      typeof payload.adminId === "string" &&
      typeof payload.shopId === "string"
    ) {
      return {
        adminId: payload.adminId,
        shopId: payload.shopId,
        role: "business_admin",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function signPendingRegistration(payload: Omit<PendingRegistrationPayload, "role">) {
  return new SignJWT({ ...payload, role: "pending_registration" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_REGISTRATION_DURATION_SECONDS}s`)
    .sign(JWT_SECRET);
}

export async function verifyPendingRegistration(
  token: string
): Promise<PendingRegistrationPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (typeof payload.adminId === "string" && payload.role === "pending_registration") {
      return { adminId: payload.adminId, role: "pending_registration" };
    }
    return null;
  } catch {
    return null;
  }
}

export function signSuperAdminSession(payload: Omit<SuperAdminSessionPayload, "role">) {
  return new SignJWT({ ...payload, role: "super_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(SA_JWT_SECRET);
}

export async function verifySuperAdminSession(
  token: string
): Promise<SuperAdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SA_JWT_SECRET);
    if (
      typeof payload.superAdminId === "string" &&
      payload.role === "super_admin"
    ) {
      return { superAdminId: payload.superAdminId, role: "super_admin" };
    }
    return null;
  } catch {
    return null;
  }
}
