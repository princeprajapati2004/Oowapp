/**
 * Single source of truth for return/refund status labels, badge styling,
 * reasons, and refund methods — mirrors src/lib/order-status.ts's pattern so
 * the owner and customer sides always show identical wording/colors, and so
 * new status pills stay visually consistent with the rest of the app.
 */
import type { ReturnStatus, ReturnReason, RefundMethod, ReturnItemCondition, LossDamageType } from "@/generated/prisma/enums";

export type { ReturnStatus, ReturnReason, RefundMethod, ReturnItemCondition };

export const RETURN_STATUSES: ReturnStatus[] = [
  "RETURN_REQUESTED",
  "RETURN_APPROVED",
  "RETURN_REJECTED",
  "ITEM_RETURNED",
  "REFUND_PENDING",
  "REFUND_PROCESSING",
  "REFUNDED",
  "REFUND_FAILED",
  "CANCELLED",
];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  RETURN_REQUESTED: "Return Requested",
  RETURN_APPROVED: "Return Approved",
  RETURN_REJECTED: "Return Rejected",
  ITEM_RETURNED: "Item Returned",
  REFUND_PENDING: "Refund Pending",
  REFUND_PROCESSING: "Refund Processing",
  REFUNDED: "Refunded",
  REFUND_FAILED: "Refund Failed",
  CANCELLED: "Cancelled",
};

export const RETURN_STATUS_BADGE_CLASS: Record<ReturnStatus, string> = {
  RETURN_REQUESTED: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  RETURN_APPROVED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  RETURN_REJECTED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  ITEM_RETURNED: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400",
  REFUND_PENDING: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  REFUND_PROCESSING: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400",
  REFUNDED: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  REFUND_FAILED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
};

// Small pill used on order cards/history when an order has any return
// activity against it — separate palette key from ReturnStatus since it has
// only two values and is derived, not stored.
export const ORDER_RETURN_BADGE_LABELS = {
  PARTIAL: "Partially Returned",
  FULL: "Fully Returned",
} as const;

export const ORDER_RETURN_BADGE_CLASS = {
  PARTIAL: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  FULL: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
} as const;

export const RETURN_REASONS: ReturnReason[] = [
  "WRONG_ITEM",
  "MISSING_ITEM",
  "DAMAGED_ITEM",
  "QUALITY_ISSUE",
  "CHANGED_MIND",
  "DUPLICATE_ORDER",
  "OTHER",
];

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  WRONG_ITEM: "Wrong item",
  MISSING_ITEM: "Missing item",
  DAMAGED_ITEM: "Damaged item",
  QUALITY_ISSUE: "Quality issue",
  CHANGED_MIND: "Customer changed mind",
  DUPLICATE_ORDER: "Duplicate order",
  OTHER: "Other",
};

export const REFUND_METHODS: RefundMethod[] = [
  "ORIGINAL_PAYMENT_METHOD",
  "UPI",
  "CASH",
  "BANK_TRANSFER",
  "WALLET",
  "OTHER",
];

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  ORIGINAL_PAYMENT_METHOD: "Original Payment Method",
  UPI: "UPI",
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  WALLET: "Wallet",
  OTHER: "Other",
};

export const RETURN_ITEM_CONDITIONS: ReturnItemCondition[] = [
  "RESELLABLE",
  "DAMAGED",
  "WASTE",
  "NOT_RESELLABLE",
];

export const RETURN_ITEM_CONDITION_LABELS: Record<ReturnItemCondition, string> = {
  RESELLABLE: "Resellable",
  DAMAGED: "Damaged",
  WASTE: "Waste",
  NOT_RESELLABLE: "Not Resellable",
};

// RESELLABLE restocks Product.stock; everything else creates a linked
// LossDamageRecord instead — see return-request.ts's inventory-impact logic.
export function conditionRestocksInventory(condition: ReturnItemCondition): boolean {
  return condition === "RESELLABLE";
}

// Maps a non-RESELLABLE return condition to the LossDamageType used for the
// auto-created linked record — kept a plain lookup (not a 1:1 name match)
// since ReturnItemCondition and LossDamageType are deliberately separate
// enums serving different UIs.
export const CONDITION_TO_LOSS_DAMAGE_TYPE: Partial<Record<ReturnItemCondition, LossDamageType>> = {
  DAMAGED: "DAMAGED",
  WASTE: "WASTED",
  NOT_RESELLABLE: "OTHER",
};

/** Fully derived display id ("RET-XXXXXXXX") — no schema column, same trick as billNumber/invoiceNumber elsewhere. */
export function deriveReturnNumber(id: string): string {
  return `RET-${id.slice(-8).toUpperCase()}`;
}

// Which prior ReturnStatus values a given owner action may transition from —
// the API routes enforce this via a CAS `updateMany` (see
// src/app/api/admin/returns/[id]/route.ts); exported here so the UI can
// disable action buttons that are guaranteed to fail server-side too.
export const RETURN_VALID_PRIOR_STATUS: Record<
  "approve" | "reject" | "mark_item_returned" | "process_refund" | "mark_refund_failed" | "cancel",
  ReturnStatus[]
> = {
  approve: ["RETURN_REQUESTED"],
  reject: ["RETURN_REQUESTED"],
  mark_item_returned: ["RETURN_APPROVED"],
  process_refund: ["REFUND_PENDING", "REFUND_FAILED"],
  mark_refund_failed: ["REFUND_PENDING", "REFUND_PROCESSING"],
  cancel: ["RETURN_REQUESTED", "RETURN_APPROVED"],
};
