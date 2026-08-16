import { deriveOrderType } from "@/lib/order-status";

// Structural, not imported from use-bill-actions.ts — that file imports
// deriveBillFigures/isOrderPaid from here, so importing BillOrderData back
// would make this a circular value dependency. BillOrderData satisfies this
// shape automatically.
export type BillFiguresInput = {
  subtotal: number;
  taxTotal: number;
  discountedTotal: number | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paidAmount?: number | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
};

export function isOrderPaid(order: Pick<BillFiguresInput, "paymentStatus" | "paymentMethod">): boolean {
  return (
    order.paymentStatus === "PAID" ||
    (!order.paymentStatus && !!order.paymentMethod && order.paymentMethod !== "PENDING")
  );
}

/**
 * Single source of truth for the derived figures (final total after
 * discount, amount paid, balance due, order type) every bill presentation —
 * on-screen order detail, PDF download, and every print template — reads
 * from. Never recompute these inline; call this instead.
 */
export function deriveBillFigures(order: BillFiguresInput) {
  const base = order.subtotal + order.taxTotal;
  const finalTotal = order.discountedTotal ?? base;
  const discountAmt = order.discountedTotal !== null ? base - order.discountedTotal : 0;
  const orderType = deriveOrderType(order);
  const isPaid = isOrderPaid(order);
  const paidAmount = order.paidAmount ?? (isPaid ? finalTotal : 0);
  const balance = Math.max(0, finalTotal - paidAmount);
  return { finalTotal, discountAmt, orderType, isPaid, paidAmount, balance };
}
