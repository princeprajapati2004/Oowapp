import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";

// CashbackRedemptionStatus enum (schema.prisma) is PENDING | CREDITED |
// VOIDED | REVERSED — REVERSED is a CREDITED redemption clawed back after
// its order was fully refunded (see rewards.ts#reverseCashbackIfCredited);
// VOIDED is a PENDING redemption that never paid out at all.
export type CashbackReportStatus = "PENDING" | "CREDITED" | "VOIDED" | "REVERSED";

export interface CashbackReportFilters {
  from: Date;
  to: Date;
  search?: string;
  status?: CashbackReportStatus;
}

export interface CashbackReportRow {
  id: string;
  date: string;
  campaignCode: string;
  customerName: string | null;
  customerPhone: string | null;
  orderId: string;
  billNumber: string;
  orderAmount: number;
  cashbackAmount: number;
  status: CashbackReportStatus;
}

// "Cashback Used" (has the customer since spent this specific credit) isn't
// tracked per-redemption anywhere in the schema — WalletTransaction is a flat
// running ledger of credits/debits, not a per-credit spend-down record — so
// that figure is intentionally omitted rather than guessed. See
// rewards.ts#processOrderPaidRewards for the real PENDING->CREDITED/VOIDED
// lifecycle these four figures are drawn from.
export interface CashbackReportSummary {
  totalGenerated: number;
  totalCredited: number;
  totalPending: number;
  totalVoided: number;
  totalReversed: number;
}

function buildWhere(shopId: string, filters: CashbackReportFilters): Prisma.CashbackRedemptionWhereInput {
  return {
    shopId,
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { campaign: { code: { contains: filters.search, ...caseInsensitive() } } },
            { customer: { name: { contains: filters.search, ...caseInsensitive() } } },
            { customer: { phone: { contains: filters.search, ...caseInsensitive() } } },
          ],
        }
      : {}),
  };
}

export async function getCashbackReportSummary(shopId: string, filters: CashbackReportFilters): Promise<CashbackReportSummary> {
  const where = buildWhere(shopId, filters);

  const [totalAgg, creditedAgg, pendingAgg, voidedAgg, reversedAgg] = await Promise.all([
    db.cashbackRedemption.aggregate({ where, _sum: { cashbackAmount: true } }),
    db.cashbackRedemption.aggregate({ where: { ...where, status: "CREDITED" }, _sum: { cashbackAmount: true } }),
    db.cashbackRedemption.aggregate({ where: { ...where, status: "PENDING" }, _sum: { cashbackAmount: true } }),
    db.cashbackRedemption.aggregate({ where: { ...where, status: "VOIDED" }, _sum: { cashbackAmount: true } }),
    db.cashbackRedemption.aggregate({ where: { ...where, status: "REVERSED" }, _sum: { cashbackAmount: true } }),
  ]);

  return {
    totalGenerated: Number(totalAgg._sum.cashbackAmount ?? 0),
    totalCredited: Number(creditedAgg._sum.cashbackAmount ?? 0),
    totalPending: Number(pendingAgg._sum.cashbackAmount ?? 0),
    totalVoided: Number(voidedAgg._sum.cashbackAmount ?? 0),
    totalReversed: Number(reversedAgg._sum.cashbackAmount ?? 0),
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function listCashbackReportRows(
  shopId: string,
  filters: CashbackReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: CashbackReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const isAll = "all" in pagination;
  const skip = isAll ? undefined : (pagination.page - 1) * pagination.pageSize;
  const take = isAll ? EXPORT_ROW_CAP : pagination.pageSize;

  const [total, redemptions] = await Promise.all([
    db.cashbackRedemption.count({ where }),
    db.cashbackRedemption.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        campaign: { select: { code: true } },
        customer: { select: { name: true, phone: true } },
        order: { select: { billNumber: true, grandTotal: true, discountedTotal: true } },
      },
      skip,
      take,
    }),
  ]);

  const rows: CashbackReportRow[] = redemptions.map((redemption) => ({
    id: redemption.id,
    date: redemption.createdAt.toISOString(),
    campaignCode: redemption.campaign.code,
    customerName: redemption.customer?.name ?? null,
    customerPhone: redemption.customer?.phone ?? null,
    orderId: redemption.orderId,
    billNumber: redemption.order.billNumber,
    orderAmount: Number(redemption.order.discountedTotal ?? redemption.order.grandTotal),
    cashbackAmount: Number(redemption.cashbackAmount),
    status: redemption.status,
  }));

  return { rows, total, truncated: isAll && total > EXPORT_ROW_CAP };
}
