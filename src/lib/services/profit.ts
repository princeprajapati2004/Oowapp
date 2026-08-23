/**
 * Item/order-level profit math — owner-only, never imported by anything on
 * the customer-facing surface. Purchase cost is frozen per OrderItem at
 * order-creation time (OrderItem.costPrice), so a later change to a
 * product's cost never retroactively rewrites a historical order's profit —
 * same convention as OrderItem.price already following Product.price.
 */

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** A product's own margin, independent of any order — used on the product list/form. */
export function computeUnitProfit(sellingPrice: number, costPrice: number | null) {
  if (costPrice == null) return { profit: null, profitPercent: null };
  const profit = round2(sellingPrice - costPrice);
  const profitPercent = costPrice > 0 ? round2((profit / costPrice) * 100) : null;
  return { profit, profitPercent };
}

export interface ProfitLineInput {
  price: number;
  costPrice: number | null;
  quantity: number;
}

export interface OrderProfitResult {
  /** Gross revenue before any order-level discount (sum of price × qty). */
  revenue: number;
  /** Revenue actually received after the order's discount. */
  actualRevenue: number;
  /** Total cost across items with a known cost price; null if none do. */
  cost: number | null;
  /** actualRevenue − cost, prorating the discount across only the
   *  cost-known items (see computeOrderProfit below); null if cost is null. */
  profit: number | null;
  profitPercent: number | null;
  /** True when some items have a known cost and others don't — the profit
   *  figure above is real but partial, not the full order's true margin. */
  hasIncompleteCostData: boolean;
}

/**
 * Order-level profit, item-level cost basis (never derived from the bill
 * total alone). When a discount was applied, it's prorated across items by
 * revenue share so `profit` reflects the actual amount collected, not the
 * sticker price — see the worked examples in this function's test suite.
 */
export function computeOrderProfit(items: ProfitLineInput[], discountAmount: number): OrderProfitResult {
  const revenue = round2(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
  const actualRevenue = round2(Math.max(0, revenue - discountAmount));

  const knownCostItems = items.filter((i) => i.costPrice != null);
  if (knownCostItems.length === 0) {
    return { revenue, actualRevenue, cost: null, profit: null, profitPercent: null, hasIncompleteCostData: false };
  }

  const totalCost = round2(knownCostItems.reduce((sum, i) => sum + (i.costPrice as number) * i.quantity, 0));
  // Only the cost-known items' share of revenue/discount feeds the profit
  // figure — an item with no cost price contributes to revenue but can't
  // contribute a profit number, so it's excluded from this proration too.
  const knownRevenue = round2(knownCostItems.reduce((sum, i) => sum + i.price * i.quantity, 0));
  const discountShareForKnown = revenue > 0 ? (knownRevenue / revenue) * discountAmount : 0;
  const actualRevenueForKnown = round2(Math.max(0, knownRevenue - discountShareForKnown));

  const profit = round2(actualRevenueForKnown - totalCost);
  const profitPercent = totalCost > 0 ? round2((profit / totalCost) * 100) : null;

  return {
    revenue,
    actualRevenue,
    cost: totalCost,
    profit,
    profitPercent,
    hasIncompleteCostData: knownCostItems.length < items.length,
  };
}
