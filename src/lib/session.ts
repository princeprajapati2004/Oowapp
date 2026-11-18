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

// Opt-in account-wide subscription gate (see subscription.ts's
// isAccountAccessBlocked) — deliberately NOT applied by default. Oowapp's
// access model is "historical/read access always works, new paid activity
// requires an active subscription" (reversing the brief 2026-11-04..11-18
// full-blackout experiment) — a GET/read route must never call this, so
// defaulting it on here would be the wrong failure mode. Every *write*
// (create/update/delete) route that represents "new paid activity" passes
// requireActiveSubscription: true explicitly. Dynamic import avoids a
// load-order cycle: subscription.ts statically imports ForbiddenError from
// this file at module scope (for SubscriptionExpiredError extends
// ForbiddenError), so a static import back here would race module init.
export async function requireAdminSession(opts: { requireActiveSubscription?: boolean } = {}): Promise<SessionPayload> {
  const session = await getAdminSession();
  if (!session) throw new UnauthorizedError();
  if (opts.requireActiveSubscription) {
    const { assertAccountAccess } = await import("@/lib/services/subscription");
    await assertAccountAccess(session.adminId);
  }
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
