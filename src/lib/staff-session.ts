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

// Default-on account-wide subscription gate, same reasoning as
// requireAdminSession in session.ts — staff has no billing session of its
// own, so this resolves the owning adminId from the staff's shopId first.
// No exemptions needed: staff never needs to reach a renew flow (that's
// owner-only), so every /api/staff/* route should simply stop working.
export async function requireStaffSession(): Promise<StaffSessionPayload> {
  const session = await getStaffSession();
  if (!session) throw new UnauthorizedError();
  const adminId = await resolveAdminIdForShop(session.shopId);
  await assertAccountAccess(adminId);
  return session;
}

export async function requireStaffRole(...roles: StaffRole[]): Promise<StaffSessionPayload> {
  const session = await requireStaffSession();
  if (!roles.includes(session.role)) {
    throw new ForbiddenError(`This action requires one of: ${roles.join(", ")}`);
  }
  return session;
}
