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

// Default-on account-wide subscription gate (see subscription.ts's
// isAccountAccessBlocked) — every /api/admin/* route gets this for free just
// by calling requireAdminSession(), so a direct API call can't bypass the
// expired-lockout the way only hitting the UI once could. Dynamic import
// avoids a load-order cycle: subscription.ts statically imports ForbiddenError
// from this file at module scope (for SubscriptionExpiredError extends
// ForbiddenError), so a static import back here would race module init.
// Only the handful of routes the owner must still reach while locked out
// (src/app/api/admin/subscription/**, onboarding) pass skipSubscriptionCheck —
// keep this list in sync with admin/layout.tsx's EXEMPT_PREFIXES.
export async function requireAdminSession(opts: { skipSubscriptionCheck?: boolean } = {}): Promise<SessionPayload> {
  const session = await getAdminSession();
  if (!session) throw new UnauthorizedError();
  if (!opts.skipSubscriptionCheck) {
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
