import { db } from "@/lib/db";

export interface ResolvedOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  categoryId: string;
}

/**
 * Re-derives name/price/categoryId from the DB for every item so a client
 * can never dictate what it pays — only `productId` and `quantity` are
 * trusted from the request. Items whose productId doesn't resolve to a
 * product in this shop (wrong shop, unknown id) are dropped rather than
 * trusted.
 */
export async function resolveOrderItems(
  shopId: string,
  items: { productId: string; quantity: number }[]
): Promise<ResolvedOrderItem[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, shopId },
    select: { id: true, name: true, price: true, categoryId: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const resolved: ResolvedOrderItem[] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product || item.quantity < 1) continue;
    resolved.push({
      productId: product.id,
      name: product.name,
      price: Number(product.price),
      quantity: item.quantity,
      categoryId: product.categoryId,
    });
  }
  return resolved;
}
