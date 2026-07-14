import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SA_SESSION_COOKIE,
  verifySession,
  verifySuperAdminSession,
  type SessionPayload,
  type SuperAdminSessionPayload,
} from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// ─── Business Admin Session ───────────────────────────────────────────────────

export async function getAdminSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await getAdminSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

// ─── Super Admin Session ──────────────────────────────────────────────────────

export async function getSuperAdminSession(): Promise<SuperAdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SA_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySuperAdminSession(token);
}

export async function requireSuperAdminSession(): Promise<SuperAdminSessionPayload> {
  const session = await getSuperAdminSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
