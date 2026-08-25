import type { PaymentStatus } from "@/lib/order-status";

/**
 * Recomputes an order's payment status whenever paidAmount or the order
 * total changes for a reason other than a direct payment action (editing
 * items, allocating a party payment across multiple orders, etc.) — keeps
 * it in sync bidirectionally: a PAID order whose total grows drops back to
 * PARTIALLY_PAID, and a PARTIALLY_PAID order whose total shrinks (or which
 * receives more payment) can become PAID again. Only kicks in once
 * something has actually been paid — an order nobody has paid anything on
 * yet stays PENDING regardless. REFUNDED is a terminal state left alone.
 */
export function recomputePaymentStatus(
  currentStatus: PaymentStatus,
  paidAmount: number,
  finalTotal: number
): PaymentStatus {
  if (paidAmount <= 0 || currentStatus === "REFUNDED") return currentStatus;
  return paidAmount + 0.005 >= finalTotal ? "PAID" : "PARTIALLY_PAID";
}
