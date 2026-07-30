import { cookies } from "next/headers";
import { STAFF_SESSION_COOKIE, verifyStaffSession, type StaffSessionPayload } from "@/lib/staff-auth";
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

export async function requireStaffSession(): Promise<StaffSessionPayload> {
  const session = await getStaffSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function requireStaffRole(...roles: StaffRole[]): Promise<StaffSessionPayload> {
  const session = await requireStaffSession();
  if (!roles.includes(session.role)) {
    throw new ForbiddenError(`This action requires one of: ${roles.join(", ")}`);
  }
  return session;
}
