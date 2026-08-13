/**
 * Single source of truth for order status / payment status labels, badge
 * styling, and transition rules — used by both the admin order management UI
 * and (for the label maps) the customer-facing order views. Replaces the
 * status union literals that used to be re-declared independently in
 * orders-manager.tsx, bill-detail.tsx, and both order API routes.
 */
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

export type { OrderStatus, PaymentStatus };

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "New",
  CONFIRMED: "Confirmed",
  PREPARING: "Processing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// Tailwind badge classes using the app's existing semantic tokens/palette —
// each status gets its own distinct hue (rather than sharing one across
// several steps) so the badge alone is scannable at a glance.
export const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400",
  READY: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400",
  OUT_FOR_DELIVERY: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400",
  DELIVERED: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  CANCELLED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
};

export const PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "PARTIALLY_PAID", "PAID", "REFUNDED"];

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Unpaid",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  REFUNDED: "Refunded",
};

export const PAYMENT_BADGE_CLASS: Record<PaymentStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  PARTIALLY_PAID: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  PAID: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  REFUNDED: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
};

// Unifies the two payment-method lists that previously diverged between
// bill-detail.tsx's mark-paid UI and the admin manual-order-creation route.
export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "GPAY", label: "Google Pay" },
  { value: "PHONEPE", label: "PhonePe" },
  { value: "CARD", label: "Card" },
  { value: "DEBIT_CARD", label: "Debit Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "COD", label: "Cash on Delivery" },
  { value: "ONLINE", label: "Online Payment" },
  { value: "OTHER", label: "Other" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  const known = PAYMENT_METHODS.find((m) => m.value === method);
  return known?.label ?? method.charAt(0) + method.slice(1).toLowerCase();
}

// UPI-family methods that can show a scan-to-pay QR in the payment modal.
export const UPI_FAMILY_METHODS = new Set<string>(["UPI", "GPAY", "PHONEPE"]);

type OrderTypeFacts = {
  tableNumber?: string | null;
  deliveryAddress?: string | null;
};

export function deriveOrderType(order: OrderTypeFacts): "Delivery" | "Dine-in" | "Takeaway" {
  if (order.deliveryAddress) return "Delivery";
  if (order.tableNumber) return "Dine-in";
  return "Takeaway";
}

type OrderSourceFacts = {
  source?: string | null;
};

export function deriveOrderSource(order: OrderSourceFacts): "Manual" | "Online" {
  return order.source === "waiter" || order.source === "manual" ? "Manual" : "Online";
}

function isDeliveryOrder(order: OrderTypeFacts): boolean {
  return !!order.deliveryAddress;
}

/**
 * Forward status flow. Delivery orders route through OUT_FOR_DELIVERY /
 * DELIVERED; dine-in and takeaway orders skip straight from READY to
 * COMPLETED since there's no fulfillment leg to track.
 */
export function statusFlow(order: OrderTypeFacts): OrderStatus[] {
  const base: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY"];
  if (isDeliveryOrder(order)) {
    return [...base, "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"];
  }
  return [...base, "COMPLETED"];
}

type OrderStatusFacts = OrderTypeFacts & { status: OrderStatus };

/** The single next forward status, or null if there isn't one (terminal/cancelled). */
export function getNextStatus(order: OrderStatusFacts): OrderStatus | null {
  const flow = statusFlow(order);
  const idx = flow.indexOf(order.status);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1];
}

/** All statuses a PATCH is allowed to move this order to right now. */
export function getNextStatuses(order: OrderStatusFacts): OrderStatus[] {
  if (order.status === "CANCELLED") return [];
  const next = getNextStatus(order);
  return next ? [next] : [];
}

export function canCancel(order: OrderStatusFacts): boolean {
  return !["DELIVERED", "COMPLETED", "CANCELLED"].includes(order.status);
}

export const CANCEL_REASONS = [
  "Customer cancelled",
  "Item unavailable",
  "Payment issue",
  "Restaurant unavailable",
  "Other",
] as const;

export type PrimaryAction =
  | "receipt"
  | "confirm"
  | "start_processing"
  | "mark_ready"
  | "out_for_delivery"
  | "mark_delivered"
  | "complete"
  | "tracking"
  | "payment"
  | "print_bill"
  | "share_bill";

const ACTION_LABELS: Record<PrimaryAction, string> = {
  receipt: "Receipt",
  confirm: "Confirm Order",
  start_processing: "Start Processing",
  mark_ready: "Mark Ready",
  out_for_delivery: "Out for Delivery",
  mark_delivered: "Mark Delivered",
  complete: "Complete Order",
  tracking: "Tracking",
  payment: "Payment",
  print_bill: "Print Bill",
  share_bill: "Share Bill",
};

export function actionLabel(action: PrimaryAction): string {
  return ACTION_LABELS[action];
}

/**
 * Status-dependent action-bar contents (brief §3): what's shown changes with
 * the order's current status so an owner is never offered an impossible
 * action (e.g. "Confirm" on an already-confirmed order).
 */
export function getPrimaryActions(order: OrderStatusFacts): PrimaryAction[] {
  switch (order.status) {
    case "PENDING":
      return ["receipt", "confirm"];
    case "CONFIRMED":
      return ["receipt", "start_processing", "payment"];
    case "PREPARING":
      return ["receipt", "tracking", "payment"];
    case "READY":
      return isDeliveryOrder(order)
        ? ["receipt", "out_for_delivery", "payment"]
        : ["receipt", "complete", "payment"];
    case "OUT_FOR_DELIVERY":
      return ["receipt", "mark_delivered", "payment"];
    case "DELIVERED":
      return ["print_bill", "share_bill", "complete"];
    case "COMPLETED":
      return ["print_bill", "share_bill"];
    case "CANCELLED":
      return ["print_bill", "share_bill"];
    default:
      return ["receipt"];
  }
}
