/**
 * Single source of truth for printer connection status / print job status
 * labels and badge styling — mirrors the pattern in order-status.ts
 * (STATUS_BADGE_CLASS), each status gets its own distinct hue so the badge
 * alone is scannable at a glance.
 */
import type {
  PrinterConnectionStatus,
  PrinterConnectionType,
  PrintJobStatus,
} from "@/generated/prisma/enums";

export type { PrinterConnectionStatus, PrinterConnectionType, PrintJobStatus };

export const CONNECTION_STATUS_LABELS: Record<PrinterConnectionStatus, string> = {
  DISCONNECTED: "Disconnected",
  CONNECTING: "Connecting…",
  CONNECTED: "Connected",
  ERROR: "Error",
  UNSUPPORTED: "Unsupported",
};

export const CONNECTION_STATUS_BADGE_CLASS: Record<PrinterConnectionStatus, string> = {
  DISCONNECTED: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
  CONNECTING: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  CONNECTED: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  ERROR: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  UNSUPPORTED: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-900/30 dark:text-slate-500",
};

export const CONNECTION_TYPE_LABELS: Record<PrinterConnectionType, string> = {
  BLUETOOTH: "Bluetooth",
  WIFI: "Wi-Fi",
  USB: "USB",
  SYSTEM: "System (browser)",
};

export const PRINT_JOB_STATUS_LABELS: Record<PrintJobStatus, string> = {
  PENDING: "Pending",
  PRINTING: "Printing…",
  COMPLETED: "Completed",
  FAILED: "Failed",
  RETRYING: "Retrying…",
  CANCELLED: "Cancelled",
};

export const PRINT_JOB_STATUS_BADGE_CLASS: Record<PrintJobStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  PRINTING: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  FAILED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  RETRYING: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
};
