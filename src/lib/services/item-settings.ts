import { db } from "@/lib/db";
import type { ItemSettingsInput } from "@/lib/validation/item-settings";

// Defaults mirror the *current* always-on product-form behavior for fields
// that already exist today (description, mrp, purchasePrice, barcode,
// stock, productImage) — so enabling Item Settings for an existing shop
// never hides a field that was already visible. Newly-introduced fields
// (wholesale, party pricing, serial, batch, product type, product code,
// offer, HSN) default OFF as opt-in capabilities. Category stays required,
// matching today's always-required behavior.
const ITEM_SETTINGS_DEFAULTS: ItemSettingsInput = {
  descriptionEnabled: true,
  mrpEnabled: true,
  purchasePriceEnabled: true,
  wholesalePriceEnabled: false,
  partyPricingEnabled: false,
  serialNumberEnabled: false,
  batchNumberEnabled: false,
  barcodeEnabled: true,
  productTypeEnabled: false,
  stockEnabled: true,
  productImageEnabled: true,
  productCodeEnabled: false,
  offerEnabled: false,
  categoryRequired: true,
  hsnEnabled: false,
  hsnRequired: false,
  allowNegativeStock: false,
};

/**
 * Lazily creates the ItemSettings row on first access so existing shops
 * never need a backfill migration — the upsert's `create` branch only fires
 * once per shop, ever. Called from both the settings page/API (to read) and
 * anywhere product create/edit or order pricing needs to know which optional
 * fields/behaviors are active for this shop.
 */
export async function getOrCreateItemSettings(shopId: string) {
  const existing = await db.itemSettings.findUnique({ where: { shopId } });
  if (existing) return existing;
  return db.itemSettings.upsert({
    where: { shopId },
    create: { shopId, ...ITEM_SETTINGS_DEFAULTS },
    update: {},
  });
}

export async function updateItemSettings(shopId: string, input: ItemSettingsInput) {
  return db.itemSettings.upsert({
    where: { shopId },
    create: { shopId, ...ITEM_SETTINGS_DEFAULTS, ...input },
    update: input,
  });
}
