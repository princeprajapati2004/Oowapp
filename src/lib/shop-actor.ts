import { getAdminSession, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { getStaffSession } from "@/lib/staff-session";
import { resolveAdminIdForShop, assertAccountAccess } from "@/lib/services/subscription";
import type { StaffRole } from "@/generated/prisma/client";

export type ShopActor =
  | { kind: "admin"; shopId: string; actorId: string; label: string }
  | { kind: "staff"; shopId: string; actorId: string; staffRole: StaffRole; label: string };

/**
 * Resolves whichever session (shop owner, or shop staff) is present for a
 * shop-scoped action shared between the owner's dashboard and staff-only
 * screens (Kitchen Display, Cash Counter). The owner's own admin session
 * always passes regardless of `allowedStaffRoles` — those only narrow which
 * StaffRole values may act. Pass no roles to allow any authenticated staff
 * member through. `requireActiveSubscription: true` opts into the
 * account-wide gate for write actions that represent new paid activity —
 * off by default so reads are never affected (see session.ts).
 */
export async function requireShopActor(
  allowedStaffRoles: StaffRole[] = [],
  opts: { requireActiveSubscription?: boolean } = {}
): Promise<ShopActor> {
  const admin = await getAdminSession();
  const actor: ShopActor | null = admin
    ? { kind: "admin", shopId: admin.shopId, actorId: admin.adminId, label: "owner" }
    : null;

  let resolved: ShopActor;
  if (actor) {
    resolved = actor;
  } else {
    const staff = await getStaffSession();
    if (!staff) throw new UnauthorizedError();
    if (allowedStaffRoles.length > 0 && !allowedStaffRoles.includes(staff.role)) {
      throw new ForbiddenError(`This action requires one of: ${allowedStaffRoles.join(", ")}`);
    }
    resolved = { kind: "staff", shopId: staff.shopId, actorId: staff.staffId, staffRole: staff.role, label: staff.name };
  }

  if (opts.requireActiveSubscription) {
    const adminId = resolved.kind === "admin" ? resolved.actorId : await resolveAdminIdForShop(resolved.shopId);
    await assertAccountAccess(adminId, resolved.kind);
  }

  return resolved;
}

/** Maps a resolved actor to the fields writeAuditLog() expects. */
export function actorAuditFields(actor: ShopActor): { actorType: "admin" | "staff"; actorId: string } {
  return actor.kind === "admin"
    ? { actorType: "admin", actorId: actor.actorId }
    : { actorType: "staff", actorId: actor.actorId };
}
