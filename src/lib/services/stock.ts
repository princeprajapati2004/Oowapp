// Item Master — shared stock-mutation helpers (spec §11: Current Stock =
// Opening + Purchases + Adjustments + Returns - Sales - Damaged - Lost).
// Consolidates the stock-adjustment logic that was previously duplicated
// inline at every write site (admin manual orders, customer/QR orders,
// purchases, purchase cancellation, return restocking). `stock === null`
// always means "untracked" and is left untouched by every helper here —
// Prisma's increment/decrement on a NULL numeric column is a SQL-level
// no-op (NULL ± x = NULL), so untracked products can never start being
// tracked as a side effect of a sale/purchase/return.
import type { Prisma } from "@/generated/prisma/client";

export interface StockLineItem {
  productId: string;
  quantity: number;
}

/**
 * Decrements stock for a sale (order creation). When the shop disallows
 * negative stock (the default — ItemSettings.allowNegativeStock), each
 * line only decrements if enough stock remains (`stock >= quantity`);
 * otherwise it's a no-op for that line rather than driving stock negative.
 * When negative-stock selling is explicitly enabled, only the
 * untracked-stays-untracked guard applies.
 *
 * This mirrors the prior inline behavior's contract exactly: a no-op here
 * never blocks the order itself from being created (stock adjustment is a
 * best-effort side effect of the sale, not a checkout-blocking validation).
 */
export async function decrementStockForSale(
  tx: Prisma.TransactionClient,
  shopId: string,
  items: StockLineItem[],
  options: { allowNegativeStock: boolean }
) {
  const tracked = items.filter((i) => i.quantity > 0);
  if (tracked.length === 0) return;
  await Promise.all(
    tracked.map((item) =>
      tx.product.updateMany({
        where: {
          id: item.productId,
          shopId,
          stock: options.allowNegativeStock ? { not: null } : { gte: item.quantity },
        },
        data: { stock: { decrement: item.quantity } },
      })
    )
  );
}

/** Increments stock — purchases received, or a returned item marked RESELLABLE. */
export async function incrementStock(tx: Prisma.TransactionClient, items: StockLineItem[]) {
  const tracked = items.filter((i) => i.quantity > 0);
  if (tracked.length === 0) return;
  await Promise.all(
    tracked.map((item) =>
      tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
    )
  );
}

/**
 * Reverses a purchase's stock increment on cancellation, clamped at 0 (stock
 * received may have already partially sold through by cancel time — same
 * convention as loss-damage.ts). Reads current stock per item since a plain
 * `decrement` could otherwise go negative here.
 */
export async function reverseStockIncrement(tx: Prisma.TransactionClient, items: StockLineItem[]) {
  for (const item of items) {
    const product = await tx.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
    if (product?.stock != null) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: Math.max(0, product.stock - item.quantity) },
      });
    }
  }
}
