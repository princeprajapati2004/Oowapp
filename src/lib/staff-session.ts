import { cookies } from "next/headers";
import { STAFF_SESSION_COOKIE, verifyStaffSession, type StaffSessionPayload } from "@/lib/staff-auth";
import { resolveAdminIdForShop, assertAccountAccess } from "@/lib/services/subscription";
import type { StaffRole } from "@/generated/prisma/client";

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

export async function getStaffSession(): Promise<StaffSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyStaffSession(token);
}

// Opt-in account-wide subscription gate, same reasoning as
// requireAdminSession in session.ts — off by default so read routes are
// never affected; a write route that represents new paid activity passes
// requireActiveSubscription: true. Staff has no billing session of its own,
// so this resolves the owning adminId from the staff's shopId first.
export async function requireStaffSession(opts: { requireActiveSubscription?: boolean } = {}): Promise<StaffSessionPayload> {
  const session = await getStaffSession();
  if (!session) throw new UnauthorizedError();
  if (opts.requireActiveSubscription) {
    const adminId = await resolveAdminIdForShop(session.shopId);
    await assertAccountAccess(adminId);
  }
  return session;
}

export async function requireStaffRole(
  roles: StaffRole[],
  opts: { requireActiveSubscription?: boolean } = {}
): Promise<StaffSessionPayload> {
  const session = await requireStaffSession(opts);
  if (!roles.includes(session.role)) {
    throw new ForbiddenError(`This action requires one of: ${roles.join(", ")}`);
  }
  return session;
}
