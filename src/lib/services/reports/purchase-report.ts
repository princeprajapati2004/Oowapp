import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";
import type { PurchaseStatus, PaymentStatus } from "@/generated/prisma/enums";

export interface PurchaseReportFilters {
  from: Date;
  to: Date;
  search?: string;
  supplierId?: string;
  paymentStatus?: string;
  status?: string;
}

export interface PurchaseReportRow {
  id: string;
  purchaseNumber: string;
  date: string;
  supplierName: string;
  itemCount: number;
  quantity: number;
  total: number;
  paid: number;
  pending: number;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
}

export interface PurchaseReportSummary {
  totalPurchaseAmount: number;
  purchaseCount: number;
  paid: number;
  pending: number;
}

// Cancelled purchases are excluded by default (same baseline convention as
// the Sales report) — a simple where: {status: {not: "CANCELLED"}}, not a
// filter toggle. If the owner explicitly picks "Cancelled" from the Status
// dropdown, that explicit choice wins instead.
function buildWhere(shopId: string, filters: PurchaseReportFilters): Prisma.PurchaseWhereInput {
  return {
    shopId,
    purchaseDate: { gte: filters.from, lte: filters.to },
    status: filters.status ? (filters.status as PurchaseStatus) : { not: "CANCELLED" },
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus as PaymentStatus } : {}),
    ...(filters.search
      ? {
          OR: [
            { purchaseNumber: { contains: filters.search, ...caseInsensitive() } },
            { supplierName: { contains: filters.search, ...caseInsensitive() } },
            { invoiceNumber: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };
}

export async function getPurchaseReportSummary(shopId: string, filters: PurchaseReportFilters): Promise<PurchaseReportSummary> {
  const where = buildWhere(shopId, filters);
  const agg = await db.purchase.aggregate({
    where,
    _sum: { grandTotal: true, paidAmount: true },
    _count: true,
  });

  const totalPurchaseAmount = Number(agg._sum.grandTotal ?? 0);
  const paid = Number(agg._sum.paidAmount ?? 0);

  return {
    totalPurchaseAmount,
    purchaseCount: agg._count,
    paid,
    pending: totalPurchaseAmount - paid,
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function listPurchaseReportRows(
  shopId: string,
  filters: PurchaseReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: PurchaseReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const isAll = "all" in pagination;
  const skip = isAll ? undefined : (pagination.page - 1) * pagination.pageSize;
  const take = isAll ? EXPORT_ROW_CAP : pagination.pageSize;

  const [total, purchases] = await Promise.all([
    db.purchase.count({ where }),
    db.purchase.findMany({
      where,
      orderBy: { purchaseDate: "desc" },
      skip,
      take,
      select: {
        id: true,
        purchaseNumber: true,
        purchaseDate: true,
        supplierName: true,
        grandTotal: true,
        paidAmount: true,
        status: true,
        paymentStatus: true,
        items: { select: { quantity: true } },
      },
    }),
  ]);

  const rows: PurchaseReportRow[] = purchases.map((purchase) => {
    const total = Number(purchase.grandTotal);
    const paid = Number(purchase.paidAmount ?? 0);
    return {
      id: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      date: purchase.purchaseDate.toISOString(),
      supplierName: purchase.supplierName,
      itemCount: purchase.items.length,
      quantity: purchase.items.reduce((sum, item) => sum + item.quantity, 0),
      total,
      paid,
      pending: total - paid,
      status: purchase.status,
      paymentStatus: purchase.paymentStatus,
    };
  });

  return { rows, total, truncated: isAll && total > EXPORT_ROW_CAP };
}
