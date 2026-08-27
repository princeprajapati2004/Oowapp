import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";

export interface StockReportFilters {
  from: Date;
  to: Date;
  search?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
}

export interface StockReportRow {
  id: string;
  name: string;
  barcode: string | null;
  categoryName: string;
  // Derived (not stored) estimate — see computeOpeningStock below. Null only
  // when currentStock itself is null (stock not tracked for this product at
  // all), same "never coerce untracked to 0" rule as everywhere else.
  openingStock: number | null;
  purchasedInRange: number;
  // Excludes CANCELLED orders — a real "units sold" business figure,
  // distinct from the ALL-statuses figure baked into openingStock below.
  soldInRange: number;
  // RESELLABLE returns only, keyed off the return's item-returned timestamp.
  returnedInRange: number;
  lossDamageInRange: number;
  currentStock: number | null;
  costPrice: number | null;
  price: number;
  stockValue: number | null;
}

export interface StockReportSummary {
  totalProducts: number;
  totalStockValue: number;
  stockValueExcludedCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockThreshold: number;
}

// No configurable reorder-point field exists on Product — this is a simple,
// documented default threshold (surfaced via summary-card hints and the
// Low Stock Only filter), not a per-product setting.
export const LOW_STOCK_THRESHOLD = 10;

function buildProductWhere(shopId: string, filters: StockReportFilters): Prisma.ProductWhereInput {
  return {
    shopId,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.lowStockOnly ? { stock: { lte: LOW_STOCK_THRESHOLD } } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, ...caseInsensitive() } },
            { barcode: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };
}

function sumByProductId(groups: { productId: string | null; _sum: { quantity: number | null } }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of groups) {
    if (!g.productId) continue;
    map.set(g.productId, g._sum.quantity ?? 0);
  }
  return map;
}

/**
 * The one, shared, expensive computation both the summary cards and the
 * table rows are derived from — same "fetch once, derive summary + paginate
 * in memory" shape as item-report.ts / party-report.ts.
 *
 * "Opening Stock" is DERIVED, not stored (Product.stock is the only stock
 * field that exists — see the module doc above computeOpeningStock-adjacent
 * comments below) by reversing every real stock-affecting event that has
 * happened since `from` off of the live current stock:
 *   opening = current − purchased(since from) − returnedResellable(since from)
 *                      + soldAllStatuses(since from) + lostOrDamaged(since from)
 * Deliberately unbounded above (">= from", no "<= to" cap) — currentStock is
 * real-time "now", so reconstructing the stock level AT `from` requires
 * reversing every movement between `from` and now, not just movements inside
 * the picked [from, to] window. The separate in-range (bounded [from, to])
 * columns below are the real, exact, non-estimated per-period movement
 * figures — kept visibly distinct from the numbers feeding this formula.
 */
async function computeStockReportRows(shopId: string, filters: StockReportFilters): Promise<StockReportRow[]> {
  const where = buildProductWhere(shopId, filters);

  const [
    products,
    purchasedInRangeGroups,
    purchasedSinceFromGroups,
    soldInRangeGroups,
    soldSinceFromAllStatusGroups,
    lossDamageInRangeGroups,
    lossDamageSinceFromGroups,
    returnItemsSinceFrom,
  ] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } } },
    }),
    db.purchaseItem.groupBy({
      by: ["productId"],
      where: { purchase: { shopId, purchaseDate: { gte: filters.from, lte: filters.to }, status: "RECORDED" } },
      _sum: { quantity: true },
    }),
    db.purchaseItem.groupBy({
      by: ["productId"],
      where: { purchase: { shopId, purchaseDate: { gte: filters.from }, status: "RECORDED" } },
      _sum: { quantity: true },
    }),
    db.orderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        order: { shopId, createdAt: { gte: filters.from, lte: filters.to }, status: { not: "CANCELLED" } },
      },
      _sum: { quantity: true },
    }),
    db.orderItem.groupBy({
      by: ["productId"],
      // ALL statuses, including CANCELLED — order-creation-time stock
      // decrement is never reversed on cancellation (see module ground
      // truth), so reconstructing opening stock has to reverse it too.
      where: { productId: { not: null }, order: { shopId, createdAt: { gte: filters.from } } },
      _sum: { quantity: true },
    }),
    db.lossDamageRecord.groupBy({
      by: ["productId"],
      where: { shopId, date: { gte: filters.from, lte: filters.to } },
      _sum: { quantity: true },
    }),
    db.lossDamageRecord.groupBy({
      by: ["productId"],
      where: { shopId, date: { gte: filters.from } },
      _sum: { quantity: true },
    }),
    // ReturnItem has no direct productId column (only via orderItem), so
    // groupBy can't aggregate it at the DB level — fetched once (>= from,
    // unbounded above, same reasoning as the other "since from" queries)
    // and split into the bounded in-range / unbounded since-from maps below
    // in memory.
    db.returnItem.findMany({
      where: { condition: "RESELLABLE", returnRequest: { shopId, itemReturnedAt: { gte: filters.from } } },
      select: { quantity: true, orderItem: { select: { productId: true } }, returnRequest: { select: { itemReturnedAt: true } } },
    }),
  ]);

  const purchasedInRangeMap = sumByProductId(purchasedInRangeGroups);
  const purchasedSinceFromMap = sumByProductId(purchasedSinceFromGroups);
  const soldInRangeMap = sumByProductId(soldInRangeGroups);
  const soldSinceFromAllStatusMap = sumByProductId(soldSinceFromAllStatusGroups);
  const lossDamageInRangeMap = sumByProductId(lossDamageInRangeGroups);
  const lossDamageSinceFromMap = sumByProductId(lossDamageSinceFromGroups);

  const returnedInRangeMap = new Map<string, number>();
  const returnedSinceFromMap = new Map<string, number>();
  for (const ri of returnItemsSinceFrom) {
    const productId = ri.orderItem.productId;
    if (!productId) continue;
    returnedSinceFromMap.set(productId, (returnedSinceFromMap.get(productId) ?? 0) + ri.quantity);
    const returnedAt = ri.returnRequest.itemReturnedAt;
    if (returnedAt && returnedAt <= filters.to) {
      returnedInRangeMap.set(productId, (returnedInRangeMap.get(productId) ?? 0) + ri.quantity);
    }
  }

  return products.map((p) => {
    const currentStock = p.stock;
    const costPrice = p.costPrice != null ? Number(p.costPrice) : null;
    const price = Number(p.price);

    const purchasedInRange = purchasedInRangeMap.get(p.id) ?? 0;
    const soldInRange = soldInRangeMap.get(p.id) ?? 0;
    const returnedInRange = returnedInRangeMap.get(p.id) ?? 0;
    const lossDamageInRange = lossDamageInRangeMap.get(p.id) ?? 0;

    let openingStock: number | null = null;
    if (currentStock != null) {
      const purchasedSinceFrom = purchasedSinceFromMap.get(p.id) ?? 0;
      const returnedSinceFrom = returnedSinceFromMap.get(p.id) ?? 0;
      const soldSinceFromAllStatus = soldSinceFromAllStatusMap.get(p.id) ?? 0;
      const lossDamageSinceFrom = lossDamageSinceFromMap.get(p.id) ?? 0;
      openingStock = currentStock - purchasedSinceFrom - returnedSinceFrom + soldSinceFromAllStatus + lossDamageSinceFrom;
    }

    const stockValue = currentStock != null && costPrice != null ? Math.round(currentStock * costPrice * 100) / 100 : null;

    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      categoryName: p.category.name,
      openingStock,
      purchasedInRange,
      soldInRange,
      returnedInRange,
      lossDamageInRange,
      currentStock,
      costPrice,
      price,
      stockValue,
    };
  });
}

export function summarizeStockReportRows(rows: StockReportRow[]): StockReportSummary {
  const withValue = rows.filter((r) => r.stockValue !== null);
  return {
    totalProducts: rows.length,
    totalStockValue: withValue.reduce((sum, r) => sum + (r.stockValue as number), 0),
    stockValueExcludedCount: rows.length - withValue.length,
    lowStockCount: rows.filter((r) => r.currentStock != null && r.currentStock <= LOW_STOCK_THRESHOLD).length,
    outOfStockCount: rows.filter((r) => r.currentStock === 0).length,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function getStockReportData(
  shopId: string,
  filters: StockReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ summary: StockReportSummary; rows: StockReportRow[]; total: number; truncated: boolean }> {
  const allRows = await computeStockReportRows(shopId, filters);
  const summary = summarizeStockReportRows(allRows);
  const total = allRows.length;

  const isAll = "all" in pagination;
  if (isAll) {
    const rows = allRows.slice(0, EXPORT_ROW_CAP);
    return { summary, rows, total, truncated: total > EXPORT_ROW_CAP };
  }

  const skip = (pagination.page - 1) * pagination.pageSize;
  const rows = allRows.slice(skip, skip + pagination.pageSize);
  return { summary, rows, total, truncated: false };
}
