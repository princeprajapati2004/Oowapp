// Item Master — pure selling-price/offer math, no DB access (same
// client-safe convention as profit.ts — this file is imported directly by
// the product form for a live offer preview, so it must never import `db`;
// see pricing-resolver.ts for the DB-touching orchestration that uses these).
// Never reads/writes Product.price/mrp itself — those stay the stored,
// unmutated base values (spec: "DO NOT overwrite the original purchase
// price when selling" / "MRP must remain the maximum/reference retail
// price").
import type { PartyCategory } from "@/generated/prisma/enums";
import { round2 } from "@/lib/services/billing";

export type PriceSource = "PARTY" | "WHOLESALE" | "BASE";

export interface PriceResolutionInput {
  price: number;
  wholesalePrice: number | null;
}

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
}

/**
 * Pure selection per spec priority: Party/Customer-specific price > Wholesale
 * price (only when the ordering Party's category is WHOLESALE and the
 * product has one set) > normal selling price. Never fabricates a price —
 * falls through to `price` whenever a higher-priority tier doesn't apply.
 */
export function resolveSellingPrice(
  product: PriceResolutionInput,
  options: { partyOverridePrice?: number | null; partyCategory?: PartyCategory | null } = {}
): ResolvedPrice {
  if (options.partyOverridePrice != null) {
    return { price: options.partyOverridePrice, source: "PARTY" };
  }
  if (options.partyCategory === "WHOLESALE" && product.wholesalePrice != null) {
    return { price: product.wholesalePrice, source: "WHOLESALE" };
  }
  return { price: product.price, source: "BASE" };
}

export interface OfferResult {
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
}

/**
 * Applies a product's structured offer on top of an already-resolved base
 * price (spec section 8). Discount is clamped to [0, basePrice] so a
 * misconfigured flat offer can never produce a negative price. Returns the
 * base price unchanged (as `originalPrice`/`finalPrice`) when there's no
 * offer — callers can always trust `finalPrice` as "what to actually charge"
 * regardless of whether an offer applied.
 */
export function applyOffer(
  basePrice: number,
  offerType: string | null | undefined,
  offerValue: number | null | undefined
): OfferResult {
  if (!offerType || offerValue == null || offerValue <= 0) {
    return { originalPrice: round2(basePrice), discountAmount: 0, finalPrice: round2(basePrice) };
  }
  const rawDiscount = offerType === "PERCENTAGE" ? (basePrice * offerValue) / 100 : offerValue;
  const discountAmount = round2(Math.min(Math.max(rawDiscount, 0), basePrice));
  return {
    originalPrice: round2(basePrice),
    discountAmount,
    finalPrice: round2(basePrice - discountAmount),
  };
}
