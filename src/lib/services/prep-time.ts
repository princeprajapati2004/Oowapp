import { z } from "zod";

/**
 * Preparation-time estimation for Order Display / KDS. The core rule (spec
 * §4): estimate from the item that takes longest, not the sum of every item
 * — a kitchen works on multiple items in parallel, so summing would wildly
 * overestimate a multi-item order. Large-quantity/peak-hour/order-type
 * adjustments are additive on top of that single base figure.
 */

export const MIN_PREP_MINUTES = 5;
export const MAX_PREP_MINUTES = 180;

export type OrderFulfillmentType = "Delivery" | "Dine-in" | "Takeaway";

const peakHourWindowSchema = z
  .object({
    // 24h "HH:mm", shop-local time (Shop.timezone). No overnight wraparound
    // (start must be < end) — kept simple since a window crossing midnight
    // is a rare edge case for meal-time "peak hours" this feature targets.
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    extraMinutes: z.number().int().min(0).max(120),
  })
  .refine((w) => w.start < w.end, { message: "Peak hour window start must be before end" });

export const PREP_TIME_SETTINGS_SCHEMA = z.object({
  defaultMinutes: z.number().int().min(MIN_PREP_MINUTES).max(MAX_PREP_MINUTES),
  bufferMinutes: z.number().int().min(0).max(60),
  largeQtyThreshold: z.number().int().min(1).max(999),
  largeQtyExtraMinutes: z.number().int().min(0).max(120),
  peakHours: z.array(peakHourWindowSchema).max(10),
  orderTypeAdjustments: z.object({
    Delivery: z.number().int().min(0).max(120),
    "Dine-in": z.number().int().min(0).max(120),
    Takeaway: z.number().int().min(0).max(120),
  }),
  delayedAlertMinutes: z.number().int().min(1).max(180),
});

export type PrepTimeSettings = z.infer<typeof PREP_TIME_SETTINGS_SCHEMA>;

export const DEFAULT_PREP_TIME_SETTINGS: PrepTimeSettings = {
  defaultMinutes: 15,
  bufferMinutes: 5,
  largeQtyThreshold: 8,
  largeQtyExtraMinutes: 10,
  peakHours: [],
  orderTypeAdjustments: { Delivery: 10, "Dine-in": 0, Takeaway: 0 },
  delayedAlertMinutes: 15,
};

/**
 * Parses Shop.prepTimeSettings (nullable Json). Merges field-by-field over
 * the defaults rather than failing closed on a stored value that predates a
 * newly-added field — same lazily-defaulted convention as ItemSettings.
 */
export function getPrepTimeSettings(rawSettings: unknown): PrepTimeSettings {
  if (!rawSettings || typeof rawSettings !== "object") return DEFAULT_PREP_TIME_SETTINGS;
  const parsed = PREP_TIME_SETTINGS_SCHEMA.safeParse({ ...DEFAULT_PREP_TIME_SETTINGS, ...(rawSettings as object) });
  return parsed.success ? parsed.data : DEFAULT_PREP_TIME_SETTINGS;
}

function clampMinutes(minutes: number): number {
  return Math.min(MAX_PREP_MINUTES, Math.max(MIN_PREP_MINUTES, Math.round(minutes)));
}

function nowHHmmInTimezone(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${h}:${m}`;
  } catch {
    return "00:00";
  }
}

function peakHourExtraMinutes(now: Date, timezone: string, peakHours: PrepTimeSettings["peakHours"]): number {
  if (peakHours.length === 0) return 0;
  const hhmm = nowHHmmInTimezone(now, timezone);
  return peakHours
    .filter((w) => w.start <= hhmm && hhmm < w.end)
    .reduce((max, w) => Math.max(max, w.extraMinutes), 0);
}

export interface PrepEstimateItemInput {
  quantity: number;
  // Already resolved by the caller: Product.prepTimeMinutes ?? Category.prepTimeMinutes ?? null.
  resolvedPrepTimeMinutes: number | null;
}

export interface PrepEstimateInput {
  items: PrepEstimateItemInput[];
  orderType: OrderFulfillmentType;
  settings: PrepTimeSettings;
  timezone: string;
  now: Date;
  /** Owner/kitchen manual override — replaces the whole calculation when set. */
  manualOverrideMinutes?: number | null;
}

export interface PrepEstimateBreakdown {
  baseMinutes: number;
  largeQtyExtraMinutes: number;
  peakHourExtraMinutes: number;
  orderTypeAdjustmentMinutes: number;
  bufferMinutes: number;
  totalMinutes: number;
  isManualOverride: boolean;
}

export function calculatePrepEstimate(input: PrepEstimateInput): PrepEstimateBreakdown {
  if (input.manualOverrideMinutes != null) {
    const totalMinutes = clampMinutes(input.manualOverrideMinutes);
    return {
      baseMinutes: totalMinutes,
      largeQtyExtraMinutes: 0,
      peakHourExtraMinutes: 0,
      orderTypeAdjustmentMinutes: 0,
      bufferMinutes: 0,
      totalMinutes,
      isManualOverride: true,
    };
  }

  const perItemMinutes = input.items.map((i) => i.resolvedPrepTimeMinutes ?? input.settings.defaultMinutes);
  const baseMinutes = perItemMinutes.length > 0 ? Math.max(...perItemMinutes) : input.settings.defaultMinutes;
  const totalQty = input.items.reduce((sum, i) => sum + i.quantity, 0);
  const largeQtyExtra = totalQty >= input.settings.largeQtyThreshold ? input.settings.largeQtyExtraMinutes : 0;
  const peakExtra = peakHourExtraMinutes(input.now, input.timezone, input.settings.peakHours);
  const orderTypeAdjustment = input.settings.orderTypeAdjustments[input.orderType] ?? 0;
  const bufferMinutes = input.settings.bufferMinutes;

  const totalMinutes = clampMinutes(baseMinutes + largeQtyExtra + peakExtra + orderTypeAdjustment + bufferMinutes);

  return {
    baseMinutes,
    largeQtyExtraMinutes: largeQtyExtra,
    peakHourExtraMinutes: peakExtra,
    orderTypeAdjustmentMinutes: orderTypeAdjustment,
    bufferMinutes,
    totalMinutes,
    isManualOverride: false,
  };
}
