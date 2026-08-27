import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import { computeUnitProfit } from "@/lib/services/profit";
import type { Prisma } from "@/generated/prisma/client";

export interface ItemReportFilters {
  from: Date;
  to: Date;
  search?: string;
  categoryId?: string;
}

export interface ItemReportRow {
  id: string;
  name: string;
  barcode: string | null;
  categoryName: string;
  // Labeled "Purchase Price" in the UI per spec even though the DB/field
  // name is costPrice.
  costPrice: number | null;
  price: number;
  mrp: number | null;
  stock: number | null;
  unit: string | null;
  unitsSold: number;
  unitsPurchased: number;
  salesAmount: number;
  // Null (never 0) when the product has no cost price set — computeUnitProfit
  // (src/lib/services/profit.ts) already encodes this "unknown, not zero"
  // distinction; it's carried through unchanged rather than defaulted away.
  profit: number | null;
}

export interface ItemReportSummary {
  totalProducts: number;
  totalUnitsSold: number;
  totalSalesAmount: number;
  totalProfit: number;
  excludedFromProfitCount: number;
}

function buildProductWhere(shopId: string, filters: ItemReportFilters): Prisma.ProductWhereInput {
  return {
    shopId,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
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

/**
 * The shared, expensive computation both the summary cards and the table
 * rows are derived from. Lists ALL products matching the search/category
 * filter (never only ones with sales activity — a zero-sold product is
 * still a real row, not something to hide), then left-joins two date-scoped
 * groupBy aggregates onto it: sold qty/amount from OrderItem (order-linked,
 * excluding CANCELLED orders) and purchased qty from PurchaseItem
 * (purchase-linked, RECORDED purchases only — best-effort since the
 * Purchase system is new and may have little/no data yet). Per-product
 * profit reuses computeUnitProfit from profit.ts unchanged.
 */
async function computeItemReportRows(shopId: string, filters: ItemReportFilters): Promise<ItemReportRow[]> {
  const where = buildProductWhere(shopId, filters);

  const [products, soldGroups, purchasedGroups] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } } },
    }),
    db.orderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        order: { shopId, createdAt: { gte: filters.from, lte: filters.to }, status: { not: "CANCELLED" } },
      },
      _sum: { quantity: true, lineTotal: true },
    }),
    db.purchaseItem.groupBy({
      by: ["productId"],
      where: {
        purchase: { shopId, purchaseDate: { gte: filters.from, lte: filters.to }, status: "RECORDED" },
      },
      _sum: { quantity: true },
    }),
  ]);

  const soldMap = new Map<string, { qty: number; amount: number }>();
  for (const g of soldGroups) {
    if (!g.productId) continue;
    soldMap.set(g.productId, { qty: g._sum.quantity ?? 0, amount: Number(g._sum.lineTotal ?? 0) });
  }
  const purchasedMap = new Map<string, number>();
  for (const g of purchasedGroups) {
    purchasedMap.set(g.productId, g._sum.quantity ?? 0);
  }

  return products.map((p) => {
    const sold = soldMap.get(p.id);
    const unitsSold = sold?.qty ?? 0;
    const salesAmount = sold?.amount ?? 0;
    const unitsPurchased = purchasedMap.get(p.id) ?? 0;
    const costPrice = p.costPrice != null ? Number(p.costPrice) : null;
    const price = Number(p.price);
    const { profit: unitProfit } = computeUnitProfit(price, costPrice);

    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      categoryName: p.category.name,
      costPrice,
      price,
      mrp: p.mrp != null ? Number(p.mrp) : null,
      stock: p.stock,
      unit: p.unit,
      unitsSold,
      unitsPurchased,
      salesAmount,
      profit: unitProfit != null ? Math.round(unitProfit * unitsSold * 100) / 100 : null,
    };
  });
}

export function summarizeItemReportRows(rows: ItemReportRow[]): ItemReportSummary {
  const withProfit = rows.filter((r) => r.profit !== null);
  return {
    totalProducts: rows.length,
    totalUnitsSold: rows.reduce((sum, r) => sum + r.unitsSold, 0),
    totalSalesAmount: rows.reduce((sum, r) => sum + r.salesAmount, 0),
    totalProfit: withProfit.reduce((sum, r) => sum + (r.profit as number), 0),
    excludedFromProfitCount: rows.length - withProfit.length,
  };
}

const EXPORT_ROW_CAP = 20_000;

/**
 * Fetches + computes the full filtered row set once, derives the summary
 * from every matching row (never just the current page), then paginates in
 * memory for the table — same shared-computation shape as
 * getPartyReportData in party-report.ts, for the same reason: the summary
 * and the table both need the identical joined dataset.
 */
export async function getItemReportData(
  shopId: string,
  filters: ItemReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ summary: ItemReportSummary; rows: ItemReportRow[]; total: number; truncated: boolean }> {
  const allRows = await computeItemReportRows(shopId, filters);
  const summary = summarizeItemReportRows(allRows);
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
