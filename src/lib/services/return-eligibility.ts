import type { OrderStatus, ReturnStatus } from "@/generated/prisma/enums";

type EligibilityOrderFacts = { status: OrderStatus };

/** Only fully fulfilled orders can have a return requested against them. */
export function isOrderReturnEligible(order: EligibilityOrderFacts): boolean {
  return order.status === "COMPLETED" || order.status === "DELIVERED";
}

// ─── Sales Return Policy (Settings -> Order Settings) ─────────────────────

const RETURN_ELIGIBLE_STATUSES: OrderStatus[] = ["DELIVERED", "COMPLETED"];

/**
 * Freezes the shop's current return policy onto an order the first time it
 * reaches DELIVERED/COMPLETED — called from every code path that can make
 * that transition (admin PATCH .../orders/[id] "status" action,
 * table-sessions closeTable). Returns null (nothing to merge into the
 * update) when: the order already has a snapshot (never overwrite), or
 * `newStatus` isn't a fulfillment status. Idempotent by construction — a
 * retried/duplicate transition is a safe no-op.
 */
export function buildReturnPolicySnapshot(
  shop: { returnPolicyEnabled: boolean; returnWindowDays: number },
  existingOrder: { returnDeadline: Date | null },
  newStatus: OrderStatus
): { returnPolicyEnabledAtCompletion: boolean; returnWindowDaysAtCompletion: number; returnDeadline: Date } | null {
  if (existingOrder.returnDeadline != null) return null;
  if (!RETURN_ELIGIBLE_STATUSES.includes(newStatus)) return null;
  return {
    returnPolicyEnabledAtCompletion: shop.returnPolicyEnabled,
    returnWindowDaysAtCompletion: shop.returnWindowDays,
    returnDeadline: new Date(Date.now() + shop.returnWindowDays * 24 * 60 * 60 * 1000),
  };
}

type ReturnWindowOrderFacts = EligibilityOrderFacts & {
  returnPolicyEnabledAtCompletion: boolean | null;
  returnDeadline: Date | string | null;
};

/**
 * Customer self-service eligibility — stricter than isOrderReturnEligible:
 * also enforces the policy snapshot frozen at completion time. Orders with
 * no snapshot (returnDeadline null) are either not yet fulfilled — already
 * excluded by the base status check — or completed before this feature
 * shipped, which keep the pre-existing unlimited-window behavior rather
 * than retroactively losing return eligibility. Owner/staff-initiated
 * returns are NOT subject to this — see createReturnRequest's
 * `enforceReturnWindow` flag, only set true by the customer route.
 */
export function isOrderReturnEligibleForCustomer(order: ReturnWindowOrderFacts): boolean {
  if (!isOrderReturnEligible(order)) return false;
  if (order.returnDeadline == null) return true;
  if (order.returnPolicyEnabledAtCompletion === false) return false;
  return Date.now() <= new Date(order.returnDeadline).getTime();
}

type ReturnableItemFacts = { quantity: number; returnedQuantity: number };

/** `quantity - returnedQuantity` is the authoritative "still returnable" amount. */
export function computeReturnableQuantity(item: ReturnableItemFacts): number {
  return Math.max(0, item.quantity - item.returnedQuantity);
}

// Statuses where a return has genuinely reached the customer receiving
// something back / a refund progressing — not merely requested/approved.
const PHYSICALLY_CONFIRMED_STATUSES: ReturnStatus[] = [
  "ITEM_RETURNED",
  "REFUND_PENDING",
  "REFUND_PROCESSING",
  "REFUNDED",
];

const INACTIVE_RETURN_STATUSES: ReturnStatus[] = ["RETURN_REJECTED", "CANCELLED"];

type OrderBadgeItemFacts = { quantity: number };
type OrderBadgeReturnFacts = {
  status: ReturnStatus;
  items: { quantity: number }[];
};

export type OrderReturnBadge = "PARTIAL" | "FULL" | null;

/**
 * Derives the small "Partially Returned" / "Fully Returned" indicator shown
 * on order cards (owner order-card.tsx, customer order-history.tsx) —
 * counts only physically-confirmed returned quantity toward "FULL", but
 * shows "PARTIAL" as soon as any non-terminal-negative return exists so a
 * pending request is still visible to both sides.
 */
export function computeOrderReturnBadge(
  items: OrderBadgeItemFacts[],
  returnRequests: OrderBadgeReturnFacts[]
): OrderReturnBadge {
  const totalOrderedQty = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalOrderedQty === 0) return null;

  const confirmedReturnedQty = returnRequests
    .filter((r) => PHYSICALLY_CONFIRMED_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0);

  if (confirmedReturnedQty >= totalOrderedQty && confirmedReturnedQty > 0) return "FULL";

  const hasActiveReturn =
    confirmedReturnedQty > 0 ||
    returnRequests.some((r) => !INACTIVE_RETURN_STATUSES.includes(r.status));

  return hasActiveReturn ? "PARTIAL" : null;
}

type OrderRefundFacts = { status: ReturnStatus; requestedRefundAmount: number };

/**
 * Sum of actually-REFUNDED returns for an order — used to show "Refund" /
 * "Net Paid" alongside Payment Details, without ever writing to
 * Order.paidAmount itself (which stays a monotonically-increasing "total
 * collected" figure everywhere else in the app — see the doc comment on
 * mark_refunded in src/app/api/admin/orders/[id]/route.ts). Only REFUNDED
 * counts; a pending/approved/rejected return hasn't actually moved money yet.
 */
export function computeOrderTotalRefunded(returnRequests: OrderRefundFacts[]): number {
  return returnRequests
    .filter((r) => r.status === "REFUNDED")
    .reduce((sum, r) => sum + r.requestedRefundAmount, 0);
}
