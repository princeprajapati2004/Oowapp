import { z } from "zod";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Display types/settings/payload shapes shared by server code
 * (src/lib/services/display.ts, the display API routes) AND client
 * components (Display Management UI, the public display board) — kept free
 * of any server-only import (no `db`, no `crypto`) so it's safe to pull into
 * a "use client" file, same convention as src/lib/order-status.ts.
 */

export const DISPLAY_TYPES = [
  "KITCHEN",
  "CUSTOMER_STATUS",
  "PREPARATION",
  "READY_PICKUP",
  "DELIVERY_DISPATCH",
  "TOKEN",
  "CUSTOM",
] as const;

export type DisplayTypeValue = (typeof DISPLAY_TYPES)[number];

export const DISPLAY_TYPE_LABELS: Record<DisplayTypeValue, string> = {
  KITCHEN: "Kitchen Order Display (KDS)",
  CUSTOMER_STATUS: "Customer Order Status Display",
  PREPARATION: "Order Preparation Display",
  READY_PICKUP: "Ready for Pickup Display",
  DELIVERY_DISPATCH: "Delivery & Dispatch Display",
  TOKEN: "Token Display",
  CUSTOM: "Custom Business Display",
};

export const DISPLAY_TYPE_DESCRIPTIONS: Record<DisplayTypeValue, string> = {
  KITCHEN: "Order cards for kitchen staff to accept, prepare and mark ready.",
  CUSTOMER_STATUS: "A customer-facing board showing every active order's status.",
  PREPARATION: "Shows only orders currently being prepared.",
  READY_PICKUP: "Shows orders that are ready, for a pickup counter.",
  DELIVERY_DISPATCH: "Shows orders out for delivery or delivered.",
  TOKEN: "Large token/order numbers only — no names, minimal detail.",
  CUSTOM: "Pick exactly which statuses and columns this display shows.",
};

// Which order statuses are relevant to each display type by default — drives
// both the initial snapshot query and the public SSE stream filter. CUSTOM
// has no fixed set; it reads customStatuses out of the display's own
// settings instead (falls back to the full flow if unset).
export const DISPLAY_TYPE_STATUSES: Record<Exclude<DisplayTypeValue, "CUSTOM">, OrderStatus[]> = {
  KITCHEN: ["PENDING", "CONFIRMED", "PREPARING", "READY"],
  CUSTOMER_STATUS: ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED"],
  PREPARATION: ["CONFIRMED", "PREPARING"],
  READY_PICKUP: ["READY", "COMPLETED"],
  DELIVERY_DISPATCH: ["OUT_FOR_DELIVERY", "DELIVERED"],
  TOKEN: ["PENDING", "CONFIRMED", "PREPARING", "READY"],
};

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

export function statusesForDisplay(type: DisplayTypeValue, settings: DisplaySettings): OrderStatus[] {
  if (type === "CUSTOM") {
    return settings.customStatuses && settings.customStatuses.length > 0 ? (settings.customStatuses as OrderStatus[]) : ALL_ORDER_STATUSES;
  }
  return DISPLAY_TYPE_STATUSES[type];
}

// ─── Settings ───────────────────────────────────────────────────────────────

export const DISPLAY_SETTINGS_SCHEMA = z.object({
  theme: z.enum(["light", "dark", "auto"]).default("auto"),
  layout: z.enum(["grid", "list"]).default("grid"),
  fontSize: z.enum(["sm", "md", "lg"]).default("md"),
  cardSize: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  showCustomerName: z.boolean().default(true),
  showItemDetails: z.boolean().default(true),
  showAmounts: z.boolean().default(false),
  showPrepTime: z.boolean().default(true),
  showCompletedOrders: z.boolean().default(true),
  activeOrderLimit: z.number().int().min(1).max(200).default(50),
  autoRemoveCompletedMinutes: z.number().int().min(0).max(180).default(10),
  soundEnabled: z.boolean().default(true),
  // null = fall back to the shop-wide Shop.prepTimeSettings.delayedAlertMinutes.
  delayedAlertMinutes: z.number().int().min(1).max(180).nullable().default(null),
  logoUrl: z.string().trim().max(500).nullable().default(null),
  // CUSTOM type only — which statuses this board shows. Ignored by every
  // other type (they use their fixed DISPLAY_TYPE_STATUSES set instead).
  customStatuses: z.array(z.enum(ALL_ORDER_STATUSES as [OrderStatus, ...OrderStatus[]])).max(8).nullable().default(null),
});

export type DisplaySettings = z.infer<typeof DISPLAY_SETTINGS_SCHEMA>;

const BASE_DEFAULT_SETTINGS = DISPLAY_SETTINGS_SCHEMA.parse({});

/** Per-type starting defaults for a newly-created display — mainly privacy posture. */
export function defaultSettingsForType(type: DisplayTypeValue): DisplaySettings {
  switch (type) {
    case "CUSTOMER_STATUS":
      return { ...BASE_DEFAULT_SETTINGS, showItemDetails: false, showAmounts: false };
    case "TOKEN":
      return {
        ...BASE_DEFAULT_SETTINGS,
        showCustomerName: false,
        showItemDetails: false,
        showAmounts: false,
        fontSize: "lg",
        cardSize: "spacious",
      };
    case "READY_PICKUP":
    case "DELIVERY_DISPATCH":
    case "KITCHEN":
      return { ...BASE_DEFAULT_SETTINGS, showAmounts: false };
    default:
      return BASE_DEFAULT_SETTINGS;
  }
}

/** Parses Display.settings (nullable Json), merging field-by-field over that type's defaults. */
export function getDisplaySettings(type: DisplayTypeValue, rawSettings: unknown): DisplaySettings {
  const defaults = defaultSettingsForType(type);
  if (!rawSettings || typeof rawSettings !== "object") return defaults;
  const parsed = DISPLAY_SETTINGS_SCHEMA.safeParse({ ...defaults, ...(rawSettings as object) });
  return parsed.success ? parsed.data : defaults;
}

// ─── Client-safe payload ────────────────────────────────────────────────────

export interface DisplayPayload {
  id: string;
  shopId: string;
  name: string;
  type: DisplayTypeValue;
  token: string;
  isActive: boolean;
  allowStaffActions: boolean;
  settings: DisplaySettings;
  lastConnectedAt: string | null;
  createdAt: string;
}

// What a public display board is allowed to render. Deliberately a fresh
// shape (not derived from the admin OrderEventOrder type) so every exposed
// field is an explicit decision rather than "whatever that type happens to
// have minus a blocklist" — a new sensitive field added there later defaults
// to NOT appearing here, not silently leaking onto a TV screen.
export interface PublicDisplayOrder {
  id: string;
  billNumber: string;
  tokenNumber: number | null;
  status: string;
  source: string;
  customerName: string | null;
  tableNumber: string | null;
  itemCount: number;
  items: { name: string; quantity: number }[] | null;
  grandTotal: number | null;
  notes: string | null;
  priorityFlag: string | null;
  createdAt: string;
  acceptedAt: string | null;
  estimatedReadyAt: string | null;
  actualReadyAt: string | null;
  prepDelayFlag: boolean;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}
