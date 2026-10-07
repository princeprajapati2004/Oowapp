import { z } from "zod";
import { db } from "@/lib/db";

// Configurable GST for OOWAPP's own subscription billing — reuses the generic
// PlatformSettings key/value store (one JSON-validated row) rather than a dedicated
// table or scattered unvalidated string keys.
const TAX_CONFIG_KEY = "subscription_tax_config";

export const subscriptionTaxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  // Used when cgst/sgst/igst aren't separately broken out — a flat single-rate GST.
  percentage: z.coerce.number().min(0).max(100).default(18),
  cgst: z.coerce.number().min(0).max(100).default(9),
  sgst: z.coerce.number().min(0).max(100).default(9),
  igst: z.coerce.number().min(0).max(100).default(18),
  // true = `percentage` is already baked into the displayed price (back out the tax);
  // false = tax is added on top of the plan's listed price.
  inclusive: z.boolean().default(false),
});

export type SubscriptionTaxConfig = z.infer<typeof subscriptionTaxConfigSchema>;

const DEFAULTS: SubscriptionTaxConfig = subscriptionTaxConfigSchema.parse({});

export async function getSubscriptionTaxConfig(): Promise<SubscriptionTaxConfig> {
  const row = await db.platformSettings.findUnique({ where: { key: TAX_CONFIG_KEY } });
  if (!row) return DEFAULTS;
  try {
    return subscriptionTaxConfigSchema.parse(JSON.parse(row.value));
  } catch {
    // Malformed/legacy value — fail safe to defaults rather than throwing on every
    // checkout page load.
    return DEFAULTS;
  }
}

export async function setSubscriptionTaxConfig(input: SubscriptionTaxConfig): Promise<void> {
  const value = JSON.stringify(subscriptionTaxConfigSchema.parse(input));
  await db.platformSettings.upsert({
    where: { key: TAX_CONFIG_KEY },
    create: { key: TAX_CONFIG_KEY, value },
    update: { value },
  });
}

export interface TaxBreakdown {
  baseAmount: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

/** Correct rounding: round only the final displayed amounts, never intermediate
 * per-line fractions — avoids the classic "components don't sum to the total" bug. */
export function calculateTax(baseAmount: number, config: SubscriptionTaxConfig): TaxBreakdown {
  if (!config.enabled) {
    return { baseAmount, taxAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: round2(baseAmount) };
  }

  if (config.inclusive) {
    const totalAmount = round2(baseAmount);
    const base = (baseAmount * 100) / (100 + config.percentage);
    const taxAmount = round2(baseAmount - base);
    const cgstAmount = round2(taxAmount * (config.cgst / config.percentage || 0));
    const sgstAmount = round2(taxAmount * (config.sgst / config.percentage || 0));
    return { baseAmount: round2(base), taxAmount, cgstAmount, sgstAmount, igstAmount: 0, totalAmount };
  }

  const taxAmount = round2(baseAmount * (config.percentage / 100));
  const cgstAmount = round2(baseAmount * (config.cgst / 100));
  const sgstAmount = round2(baseAmount * (config.sgst / 100));
  const totalAmount = round2(baseAmount + taxAmount);
  return { baseAmount: round2(baseAmount), taxAmount, cgstAmount, sgstAmount, igstAmount: 0, totalAmount };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
