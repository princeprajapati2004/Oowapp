import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

export interface SalesReportFilters {
  from: Date;
  to: Date;
  search?: string;
  paymentStatus?: string;
  orderStatus?: string;
  paymentMethod?: string;
}

export interface SalesReportRow {
  id: string;
  billNumber: string;
  date: string;
  customerName: string | null;
  orderType: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  pending: number;
  paymentStatus: PaymentStatus;
}

export interface SalesReportSummary {
  totalSales: number;
  orderCount: number;
  paidAmount: number;
  pendingAmount: number;
  discount: number;
  tax: number;
  totalRefunds: number;
  netSales: number;
}

// Cancelled orders are excluded from Sales figures by default — this is the
// report's baseline, not a filter toggle. If the owner explicitly picks
// "Cancelled" from the Order Status dropdown, that explicit choice wins and
// cancelled orders are shown instead (useful for audit); ALL (no selection)
// falls back to the exclude-cancelled baseline.
function buildWhere(shopId: string, filters: SalesReportFilters): Prisma.OrderWhereInput {
  return {
    shopId,
    createdAt: { gte: filters.from, lte: filters.to },
    status: filters.orderStatus ? (filters.orderStatus as OrderStatus) : { not: "CANCELLED" },
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus as PaymentStatus } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.search
      ? {
          OR: [
            { billNumber: { contains: filters.search, ...caseInsensitive() } },
            { customerName: { contains: filters.search, ...caseInsensitive() } },
            { customerPhone: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };
}

// Effective total is discountedTotal when a discount/coupon was applied,
// otherwise grandTotal — same convention used everywhere else in the app
// (billing, order detail, party ledger).
function effectiveTotal(order: { grandTotal: Prisma.Decimal; discountedTotal: Prisma.Decimal | null }): number {
  return order.discountedTotal != null ? Number(order.discountedTotal) : Number(order.grandTotal);
}

// There's no clean Order.type field — "qr" vs "waiter" (Order.source) is the
// only channel distinction the schema actually records, so the "Order Type"
// column is an honest derived label off that field (same mapping as
// deriveOrderSource in order-status.ts), not a fabricated dine-in/delivery
// split.
function deriveOrderTypeLabel(source: string): string {
  return source === "waiter" || source === "manual" ? "Manual" : "Online";
}

export async function getSalesReportSummary(shopId: string, filters: SalesReportFilters): Promise<SalesReportSummary> {
  const where = buildWhere(shopId, filters);

  const [orders, refundAgg] = await Promise.all([
    db.order.findMany({
      where,
      select: { grandTotal: true, discountedTotal: true, paidAmount: true, taxTotal: true },
    }),
    // Refunds are scoped through the same filtered Order set (date range +
    // whatever Payment Status / Order Status / Payment Method / search is
    // active) so "Net Sales" always reconciles with "Total Sales" on screen.
    db.returnRequest.aggregate({
      where: { shopId, status: "REFUNDED", order: where },
      _sum: { requestedRefundAmount: true },
    }),
  ]);

  let totalSales = 0;
  let paidAmount = 0;
  let pendingAmount = 0;
  let discount = 0;
  let tax = 0;

  for (const order of orders) {
    const grand = Number(order.grandTotal);
    const effective = effectiveTotal(order);
    const paid = Number(order.paidAmount ?? 0);
    totalSales += effective;
    paidAmount += paid;
    pendingAmount += Math.max(0, effective - paid);
    if (order.discountedTotal != null) discount += grand - effective;
    tax += Number(order.taxTotal);
  }

  const totalRefunds = Number(refundAgg._sum.requestedRefundAmount ?? 0);

  return {
    totalSales,
    orderCount: orders.length,
    paidAmount,
    pendingAmount,
    discount,
    tax,
    totalRefunds,
    netSales: totalSales - totalRefunds,
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function listSalesReportRows(
  shopId: string,
  filters: SalesReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: SalesReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const isAll = "all" in pagination;
  const skip = isAll ? undefined : (pagination.page - 1) * pagination.pageSize;
  const take = isAll ? EXPORT_ROW_CAP : pagination.pageSize;

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        billNumber: true,
        createdAt: true,
        customerName: true,
        source: true,
        subtotal: true,
        taxTotal: true,
        grandTotal: true,
        discountedTotal: true,
        paidAmount: true,
        paymentStatus: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  const rows: SalesReportRow[] = orders.map((order) => {
    const grand = Number(order.grandTotal);
    const effective = effectiveTotal(order);
    const paid = Number(order.paidAmount ?? 0);
    return {
      id: order.id,
      billNumber: order.billNumber,
      date: order.createdAt.toISOString(),
      customerName: order.customerName,
      orderType: deriveOrderTypeLabel(order.source),
      itemCount: order._count.items,
      subtotal: Number(order.subtotal),
      discount: order.discountedTotal != null ? grand - effective : 0,
      tax: Number(order.taxTotal),
      total: effective,
      paid,
      pending: Math.max(0, effective - paid),
      paymentStatus: order.paymentStatus,
    };
  });

  return { rows, total, truncated: isAll && total > EXPORT_ROW_CAP };
}
