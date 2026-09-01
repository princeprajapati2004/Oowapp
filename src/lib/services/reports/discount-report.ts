import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";

export interface DiscountReportFilters {
  from: Date;
  to: Date;
  search?: string;
  // "PERCENTAGE" | "FIXED" match Order.discountType (manual discounts);
  // "COUPON" is a pseudo-type inferred from couponCode being set.
  discountType?: string;
}

export interface DiscountReportRow {
  id: string;
  billNumber: string;
  date: string;
  customerName: string | null;
  originalAmount: number;
  discountTypeLabel: string; // "PERCENTAGE" | "FIXED" | "Coupon" | "-"
  discountType: string | null;
  couponCode: string | null;
  discountValue: number | null;
  discountAmount: number;
  finalAmount: number;
}

export interface DiscountReportSummary {
  totalDiscount: number;
  discountedOrderCount: number;
  averageDiscount: number;
}

// discountedTotal is the authoritative "what the order actually settled at"
// figure — set for BOTH a manual staff discount and a coupon discount (a
// coupon dual-writes into discountedTotal at order-creation time, see the
// Order.discountedTotal schema comment), so filtering on it alone already
// captures every real discount. The couponDiscountAmount > 0 branch is
// belt-and-braces for any row where that dual-write didn't happen. Cashback
// (cashbackAmount/cashbackCampaignId) never touches discountedTotal — the
// customer paid full price — so cashback-only orders are naturally excluded.
function buildWhere(shopId: string, filters: DiscountReportFilters): Prisma.OrderWhereInput {
  const discountApplied: Prisma.OrderWhereInput = {
    OR: [{ discountedTotal: { not: null } }, { couponDiscountAmount: { gt: 0 } }],
  };

  let typeFilter: Prisma.OrderWhereInput = {};
  if (filters.discountType === "COUPON") {
    typeFilter = { couponCode: { not: null } };
  } else if (filters.discountType === "PERCENTAGE" || filters.discountType === "FIXED") {
    typeFilter = { discountType: filters.discountType };
  }

  return {
    shopId,
    createdAt: { gte: filters.from, lte: filters.to },
    status: { not: "CANCELLED" },
    AND: [discountApplied, typeFilter],
    ...(filters.search
      ? {
          OR: [
            { billNumber: { contains: filters.search, ...caseInsensitive() } },
            { customerName: { contains: filters.search, ...caseInsensitive() } },
            { couponCode: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };
}

function discountAmountOf(order: { grandTotal: Prisma.Decimal; discountedTotal: Prisma.Decimal | null; couponDiscountAmount: Prisma.Decimal | null }): number {
  if (order.discountedTotal != null) return Math.max(0, Number(order.grandTotal) - Number(order.discountedTotal));
  return Number(order.couponDiscountAmount ?? 0);
}

export async function getDiscountReportSummary(shopId: string, filters: DiscountReportFilters): Promise<DiscountReportSummary> {
  const where = buildWhere(shopId, filters);
  const orders = await db.order.findMany({
    where,
    select: { grandTotal: true, discountedTotal: true, couponDiscountAmount: true },
  });

  const totalDiscount = orders.reduce((sum, order) => sum + discountAmountOf(order), 0);
  const discountedOrderCount = orders.length;

  return {
    totalDiscount,
    discountedOrderCount,
    averageDiscount: discountedOrderCount > 0 ? totalDiscount / discountedOrderCount : 0,
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function listDiscountReportRows(
  shopId: string,
  filters: DiscountReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: DiscountReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const isAll = "all" in pagination;
  const skip = isAll ? undefined : (pagination.page - 1) * pagination.pageSize;
  const take = isAll ? EXPORT_ROW_CAP : pagination.pageSize;

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        billNumber: true,
        createdAt: true,
        customerName: true,
        grandTotal: true,
        discountType: true,
        discountValue: true,
        discountedTotal: true,
        couponCode: true,
        couponDiscountAmount: true,
      },
      skip,
      take,
    }),
  ]);

  const rows: DiscountReportRow[] = orders.map((order) => {
    const discountTypeLabel = order.discountType ? order.discountType : order.couponCode ? "Coupon" : "-";
    const discountAmount = discountAmountOf(order);
    return {
      id: order.id,
      billNumber: order.billNumber,
      date: order.createdAt.toISOString(),
      customerName: order.customerName,
      originalAmount: Number(order.grandTotal),
      discountTypeLabel,
      discountType: order.discountType,
      couponCode: order.couponCode,
      discountValue: order.discountValue != null ? Number(order.discountValue) : null,
      discountAmount,
      finalAmount: order.discountedTotal != null ? Number(order.discountedTotal) : Number(order.grandTotal) - discountAmount,
    };
  });

  return { rows, total, truncated: isAll && total > EXPORT_ROW_CAP };
}
