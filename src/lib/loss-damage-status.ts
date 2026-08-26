/**
 * Single source of truth for Loss & Damage type/reason labels and badge
 * styling — mirrors src/lib/return-status.ts's pattern exactly so new status
 * pills stay visually consistent with the rest of the app.
 */
import type { LossDamageType, DamageType } from "@/generated/prisma/enums";

export type { LossDamageType, DamageType };

export const LOSS_DAMAGE_TYPES: LossDamageType[] = [
  "LOST",
  "DAMAGED",
  "BROKEN",
  "SPOILED",
  "WASTED",
  "MISSING",
  "OTHER",
];

export const LOSS_DAMAGE_TYPE_LABELS: Record<LossDamageType, string> = {
  LOST: "Lost",
  DAMAGED: "Damaged",
  BROKEN: "Broken",
  SPOILED: "Spoiled",
  WASTED: "Wasted",
  MISSING: "Missing",
  OTHER: "Other",
};

export const LOSS_DAMAGE_TYPE_BADGE_CLASS: Record<LossDamageType, string> = {
  LOST: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  DAMAGED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  BROKEN: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  SPOILED: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  WASTED: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  MISSING: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
  OTHER: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
};

export const DAMAGE_TYPES: DamageType[] = [
  "BROKEN",
  "PACKAGING_DAMAGE",
  "FOOD_DAMAGE",
  "WATER_DAMAGE",
  "ELECTRICAL_DAMAGE",
  "EXPIRED",
  "QUALITY_ISSUE",
  "OTHER",
];

export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  BROKEN: "Broken",
  PACKAGING_DAMAGE: "Packaging Damage",
  FOOD_DAMAGE: "Food Damage",
  WATER_DAMAGE: "Water Damage",
  ELECTRICAL_DAMAGE: "Electrical Damage",
  EXPIRED: "Expired",
  QUALITY_ISSUE: "Quality Issue",
  OTHER: "Other",
};

/** Fully derived display id ("LD-XXXXXXXX") — no schema column, same trick as deriveReturnNumber. */
export function deriveLossDamageNumber(id: string): string {
  return `LD-${id.slice(-8).toUpperCase()}`;
}
