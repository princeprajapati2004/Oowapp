import { db } from "@/lib/db";
import { getOrCreateItemSettings } from "@/lib/services/item-settings";
import { resolveItemPricing } from "@/lib/services/pricing-resolver";

export interface ResolvedOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  categoryId: string;
  // Frozen onto OrderItem.costPrice at order-creation time — see
  // lib/services/profit.ts. Never surfaced in any customer-facing response.
  costPrice: number | null;
  // Item Master offer snapshot (see OrderItem.originalPrice/offerDiscount's
  // doc comment in schema.prisma) — both null when no offer applied to this
  // line, so `price` above already IS the actual amount charged either way.
  originalPrice: number | null;
  offerDiscount: number | null;
}

/**
 * Re-derives name/price/categoryId from the DB for every item so a client
 * can never dictate what it pays — only `productId` and `quantity` are
 * trusted from the request. Items whose productId doesn't resolve to a
 * product in this shop (wrong shop, unknown id) are dropped rather than
 * trusted.
 *
 * `customerPhone`, if given, is used for a READ-ONLY lookup of a matching
 * Party (the same "phone is the identity" join every other admin screen
 * already uses — see Party's doc comment) so party-specific/wholesale
 * pricing (Item Master) can apply automatically for a returning
 * customer/party. This never creates a Party — that still happens later,
 * inside the caller's own transaction, via findOrCreatePartyForOrder. A
 * brand-new party (this order would be their first) simply has no pricing
 * history yet, so there's nothing this lookup could find for them anyway.
 */
export async function resolveOrderItems(
  shopId: string,
  items: { productId: string; quantity: number }[],
  customerPhone?: string | null
): Promise<ResolvedOrderItem[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const [products, settings, party] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, shopId },
      select: {
        id: true,
        name: true,
        price: true,
        costPrice: true,
        categoryId: true,
        wholesalePrice: true,
        offerType: true,
        offerValue: true,
      },
    }),
    getOrCreateItemSettings(shopId),
    customerPhone
      ? db.party.findFirst({ where: { shopId, phone: customerPhone }, select: { id: true, category: true } })
      : Promise.resolve(null),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));

  const resolved: ResolvedOrderItem[] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product || item.quantity < 1) continue;

    const pricing = await resolveItemPricing({
      shopId,
      product: {
        id: product.id,
        price: Number(product.price),
        wholesalePrice: product.wholesalePrice != null ? Number(product.wholesalePrice) : null,
        offerType: product.offerType,
        offerValue: product.offerValue != null ? Number(product.offerValue) : null,
      },
      partyId: party?.id ?? null,
      partyCategory: party?.category ?? null,
      settings: {
        wholesalePriceEnabled: settings.wholesalePriceEnabled,
        partyPricingEnabled: settings.partyPricingEnabled,
        offerEnabled: settings.offerEnabled,
      },
    });

    resolved.push({
      productId: product.id,
      name: product.name,
      price: pricing.finalPrice,
      quantity: item.quantity,
      categoryId: product.categoryId,
      costPrice: product.costPrice != null ? Number(product.costPrice) : null,
      originalPrice: pricing.offerDiscount > 0 ? pricing.originalPrice : null,
      offerDiscount: pricing.offerDiscount > 0 ? pricing.offerDiscount : null,
    });
  }
  return resolved;
}
