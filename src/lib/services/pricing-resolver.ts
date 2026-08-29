// Item Master — server-only pricing orchestration (DB-touching). Kept
// separate from pricing.ts's pure math so pricing.ts stays safe to import
// from client components (e.g. the product form's live offer preview) —
// this file pulls in `db`, which must never end up in a browser bundle.
import { db } from "@/lib/db";
import type { PartyCategory } from "@/generated/prisma/enums";
import { resolveSellingPrice, applyOffer } from "@/lib/services/pricing";
import { round2 } from "@/lib/services/billing";

export async function getPartyOverridePrice(
  shopId: string,
  productId: string,
  partyId: string
): Promise<number | null> {
  const row = await db.partyProductPrice.findFirst({
    where: { shopId, productId, partyId },
    select: { price: true },
  });
  return row ? Number(row.price) : null;
}

export interface ItemPricingProduct {
  id: string;
  price: number;
  wholesalePrice: number | null;
  offerType: string | null;
  offerValue: number | null;
}

export interface ItemPricingSettings {
  wholesalePriceEnabled: boolean;
  partyPricingEnabled: boolean;
  offerEnabled: boolean;
}

export interface ItemPricingResult {
  priceSource: "PARTY" | "WHOLESALE" | "BASE";
  originalPrice: number;
  offerDiscount: number;
  finalPrice: number;
}

/**
 * Single entry point tying pricing.ts's pure functions together for one line
 * item: resolve the applicable base price (party/wholesale/normal, gated by
 * this shop's ItemSettings), then apply the product's offer on top. Used by
 * order creation (order-items.ts). `finalPrice` is what gets charged/frozen
 * onto OrderItem.price; `originalPrice`/`offerDiscount` are the snapshot
 * fields for invoice display.
 */
export async function resolveItemPricing(params: {
  shopId: string;
  product: ItemPricingProduct;
  partyId?: string | null;
  partyCategory?: PartyCategory | null;
  settings: ItemPricingSettings;
}): Promise<ItemPricingResult> {
  let partyOverridePrice: number | null = null;
  if (params.partyId && params.settings.partyPricingEnabled) {
    partyOverridePrice = await getPartyOverridePrice(params.shopId, params.product.id, params.partyId);
  }

  const { price: basePrice, source } = resolveSellingPrice(params.product, {
    partyOverridePrice,
    partyCategory: params.settings.wholesalePriceEnabled ? params.partyCategory : null,
  });

  const offer = params.settings.offerEnabled
    ? applyOffer(basePrice, params.product.offerType, params.product.offerValue)
    : { originalPrice: round2(basePrice), discountAmount: 0, finalPrice: round2(basePrice) };

  return {
    priceSource: source,
    originalPrice: offer.originalPrice,
    offerDiscount: offer.discountAmount,
    finalPrice: offer.finalPrice,
  };
}
