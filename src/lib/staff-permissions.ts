import { ForbiddenError } from "@/lib/session";
import type { ShopActor } from "@/lib/shop-actor";
import type { StaffRole } from "@/generated/prisma/client";

/**
 * Per-action staff permission check for endpoints that multiplex several
 * mutation types behind one handler (e.g. a discriminated-union PATCH) where
 * different actions need different allowed roles. requireShopActor's own
 * allowedStaffRoles gate is endpoint-wide and can't express that — this
 * fills the gap. The owner's own admin session always passes; only staff
 * sessions are checked against `allowedByRole`.
 *
 * Frontend buttons hide unavailable actions, but that's not security — every
 * action must still be re-checked here regardless of what the UI happened to
 * show.
 */
export function assertStaffActionAllowed<TAction extends string>(
  actor: ShopActor,
  action: TAction,
  allowedByRole: Record<StaffRole, ReadonlySet<TAction>>,
  moduleLabel: string
): void {
  if (actor.kind === "admin") return;
  if (!allowedByRole[actor.staffRole].has(action)) {
    throw new ForbiddenError(`Your role (${actor.staffRole}) can't perform "${action}" on ${moduleLabel}.`);
  }
}

// Order actions — Kitchen only ever advances prep status / tags priority.
// Waiter handles front-of-house/payment-collection actions (the same
// permission set the Cash Counter screen already exercises). Manager gets
// everything an owner could do on an individual order except deleting it
// outright — the DELETE handler in orders/[id]/route.ts has no other action
// to multiplex against, so it's gated directly via
// requireShopActor("MANAGER") instead of this matrix.
export type OrderAction =
  | "status"
  | "discount"
  | "remove_discount"
  | "priority"
  | "edit_items"
  | "mark_paid"
  | "mark_refunded"
  | "reject_payment_claim"
  | "cancel"
  | "note"
  | "update_delivery";

export const ORDER_ACTIONS_BY_ROLE: Record<StaffRole, ReadonlySet<OrderAction>> = {
  KITCHEN: new Set(["status", "priority"]),
  WAITER: new Set([
    "status",
    "priority",
    "edit_items",
    "cancel",
    "mark_paid",
    "reject_payment_claim",
    "note",
    "update_delivery",
  ]),
  MANAGER: new Set([
    "status",
    "priority",
    "edit_items",
    "cancel",
    "mark_paid",
    "mark_refunded",
    "reject_payment_claim",
    "note",
    "discount",
    "remove_discount",
    "update_delivery",
  ]),
};
