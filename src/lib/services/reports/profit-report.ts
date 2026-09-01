import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import { computeOrderProfit } from "@/lib/services/profit";
import type { Prisma } from "@/generated/prisma/client";

export interface ProfitReportFilters {
  from: Date;
  to: Date;
  search?: string;
  // "Only show orders with known cost data" — true means every item on the
  // order has a known cost price (computeOrderProfit's
  // hasIncompleteCostData === false AND cost !== null). Optional
  // nice-to-have filter, applied in memory after the per-order profit
  // computation since it's a derived flag, not a queryable column.
  completeOnly?: boolean;
}

export interface ProfitReportRow {
  id: string;
  billNumber: string;
  date: string;
  customerName: string | null;
  // computeOrderProfit's actualRevenue.
  salesValue: number;
  // computeOrderProfit's cost — null if no item on the order has a known
  // cost price.
  purchaseCost: number | null;
  // The discount amount fed into computeOrderProfit for this order.
  discount: number;
  // computeOrderProfit's profit — null whenever cost is null.
  grossProfit: number | null;
  profitPercent: number | null;
  hasIncompleteCostData: boolean;
}

export interface ProfitReportSummary {
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  totalDiscount: number;
  // Gross profit minus processed (REFUNDED) return refunds in the same
  // filtered order set — same join shape as sales-report.ts's totalRefunds,
  // reused here rather than reimplemented. Labeled "Net Profit (after
  // refunds)" in the UI so it's never confused with a different "Net
  // Profit" definition.
  netProfitAfterRefunds: number;
  totalRefunds: number;
  incompleteCostDataCount: number;
}

// Orders feeding the report — CANCELLED always excluded (never a filter
// toggle here, unlike sales-report.ts's explicit-choice-wins convention;
// profit on a cancelled order is not a meaningful figure).
function buildWhere(shopId: string, filters: ProfitReportFilters): Prisma.OrderWhereInput {
  return {
    shopId,
    createdAt: { gte: filters.from, lte: filters.to },
    status: { not: "CANCELLED" },
    ...(filters.search
      ? {
          OR: [
            { billNumber: { contains: filters.search, ...caseInsensitive() } },
            { customerName: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };
}

/**
 * The one, shared, expensive computation both the summary cards and the
 * table rows are derived from — computeOrderProfit (src/lib/services/
 * profit.ts) reused exactly as-is per order, its first real caller anywhere
 * in the codebase. Item-level price/costPrice/quantity come from the frozen
 * OrderItem snapshot (never the live Product), and the discount fed in is
 * grandTotal − (discountedTotal ?? grandTotal), same "effective total"
 * convention sales-report.ts already uses.
 */
async function computeProfitReportRows(shopId: string, filters: ProfitReportFilters): Promise<ProfitReportRow[]> {
  const where = buildWhere(shopId, filters);
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      billNumber: true,
      createdAt: true,
      customerName: true,
      grandTotal: true,
      discountedTotal: true,
      items: { select: { price: true, costPrice: true, quantity: true } },
    },
  });

  const rows = orders.map((order) => {
    const grand = Number(order.grandTotal);
    const effective = order.discountedTotal != null ? Number(order.discountedTotal) : grand;
    const discountAmount = Math.max(0, grand - effective);

    const items = order.items.map((i) => ({
      price: Number(i.price),
      costPrice: i.costPrice != null ? Number(i.costPrice) : null,
      quantity: i.quantity,
    }));
    const result = computeOrderProfit(items, discountAmount);

    return {
      id: order.id,
      billNumber: order.billNumber,
      date: order.createdAt.toISOString(),
      customerName: order.customerName,
      salesValue: result.actualRevenue,
      purchaseCost: result.cost,
      discount: discountAmount,
      grossProfit: result.profit,
      profitPercent: result.profitPercent,
      hasIncompleteCostData: result.hasIncompleteCostData,
    };
  });

  if (!filters.completeOnly) return rows;
  return rows.filter((r) => r.purchaseCost !== null && !r.hasIncompleteCostData);
}

export function summarizeProfitReportRows(rows: ProfitReportRow[], totalRefunds: number): ProfitReportSummary {
  const totalSales = rows.reduce((sum, r) => sum + r.salesValue, 0);
  const totalCost = rows.reduce((sum, r) => sum + (r.purchaseCost ?? 0), 0);
  const grossProfit = rows.reduce((sum, r) => sum + (r.grossProfit ?? 0), 0);
  const totalDiscount = rows.reduce((sum, r) => sum + r.discount, 0);
  return {
    totalSales,
    totalCost,
    grossProfit,
    totalDiscount,
    netProfitAfterRefunds: grossProfit - totalRefunds,
    totalRefunds,
    incompleteCostDataCount: rows.filter((r) => r.hasIncompleteCostData).length,
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function getProfitReportData(
  shopId: string,
  filters: ProfitReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ summary: ProfitReportSummary; rows: ProfitReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const [allRows, refundAgg] = await Promise.all([
    computeProfitReportRows(shopId, filters),
    // Same join shape as sales-report.ts's totalRefunds: REFUNDED return
    // requests scoped through the same filtered Order set, so the figure
    // always reconciles with whatever date range/search is active on screen.
    db.returnRequest.aggregate({
      where: { shopId, status: "REFUNDED", order: where },
      _sum: { requestedRefundAmount: true },
    }),
  ]);

  const totalRefunds = Number(refundAgg._sum.requestedRefundAmount ?? 0);
  const summary = summarizeProfitReportRows(allRows, totalRefunds);
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
