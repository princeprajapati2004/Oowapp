import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";

// ReferralStatus enum (schema.prisma) is only PENDING | REWARDED — no
// separate "Expired"/"Failed" state exists, so the report's status
// filter/column is scoped to exactly these two real values.
export type ReferralReportStatus = "PENDING" | "REWARDED";

export interface ReferralReportFilters {
  from: Date;
  to: Date;
  search?: string;
  status?: ReferralReportStatus;
}

export interface ReferralReportRow {
  id: string;
  date: string;
  referrerName: string | null;
  referrerPhone: string | null;
  referredName: string | null;
  referredPhone: string | null;
  qualifyingOrderId: string | null;
  qualifyingBillNumber: string | null;
  // null (not 0) when there's no qualifying order yet — a pending referral
  // must never show a fabricated order amount.
  orderAmount: number | null;
  rewardAmount: number;
  status: ReferralReportStatus;
  // "Credited" in the UI iff the referrer's wallet was actually credited
  // (status REWARDED and rewardedAt set) — mirrors rewards.ts's real
  // PENDING -> REWARDED transition, not a guess.
  walletCredited: boolean;
}

export interface ReferralReportSummary {
  totalReferrals: number;
  rewardedReferrals: number;
  pendingReferrals: number;
  totalRewardsPaid: number;
}

function buildWhere(shopId: string, filters: ReferralReportFilters): Prisma.ReferralWhereInput {
  return {
    shopId,
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { referrerCustomer: { name: { contains: filters.search, ...caseInsensitive() } } },
            { referrerCustomer: { phone: { contains: filters.search, ...caseInsensitive() } } },
            { referredCustomer: { name: { contains: filters.search, ...caseInsensitive() } } },
            { referredCustomer: { phone: { contains: filters.search, ...caseInsensitive() } } },
          ],
        }
      : {}),
  };
}

export async function getReferralReportSummary(shopId: string, filters: ReferralReportFilters): Promise<ReferralReportSummary> {
  const where = buildWhere(shopId, filters);

  const [totalReferrals, rewardedReferrals, pendingReferrals, rewardedAgg] = await Promise.all([
    db.referral.count({ where }),
    db.referral.count({ where: { ...where, status: "REWARDED" } }),
    db.referral.count({ where: { ...where, status: "PENDING" } }),
    db.referral.aggregate({ where: { ...where, status: "REWARDED" }, _sum: { rewardAmount: true } }),
  ]);

  return {
    totalReferrals,
    rewardedReferrals,
    pendingReferrals,
    totalRewardsPaid: Number(rewardedAgg._sum.rewardAmount ?? 0),
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function listReferralReportRows(
  shopId: string,
  filters: ReferralReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: ReferralReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const isAll = "all" in pagination;
  const skip = isAll ? undefined : (pagination.page - 1) * pagination.pageSize;
  const take = isAll ? EXPORT_ROW_CAP : pagination.pageSize;

  const [total, referrals] = await Promise.all([
    db.referral.count({ where }),
    db.referral.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        referrerCustomer: { select: { name: true, phone: true } },
        referredCustomer: { select: { name: true, phone: true } },
      },
      skip,
      take,
    }),
  ]);

  // Referral.qualifyingOrderId is a plain `String? @unique` field with no
  // @relation to Order (confirmed in schema.prisma) — so it can't be pulled
  // in via `include`. Resolve the linked orders' billNumber/effective total
  // with a separate lookup instead of guessing a relation name.
  const orderIds = referrals.map((r) => r.qualifyingOrderId).filter((id): id is string => id !== null);
  const orders = orderIds.length
    ? await db.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, billNumber: true, grandTotal: true, discountedTotal: true },
      })
    : [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const rows: ReferralReportRow[] = referrals.map((referral) => {
    const order = referral.qualifyingOrderId ? orderById.get(referral.qualifyingOrderId) : undefined;
    return {
      id: referral.id,
      date: referral.createdAt.toISOString(),
      referrerName: referral.referrerCustomer?.name ?? null,
      referrerPhone: referral.referrerCustomer?.phone ?? null,
      referredName: referral.referredCustomer?.name ?? null,
      referredPhone: referral.referredCustomer?.phone ?? null,
      qualifyingOrderId: referral.qualifyingOrderId,
      qualifyingBillNumber: order?.billNumber ?? null,
      orderAmount: order ? Number(order.discountedTotal ?? order.grandTotal) : null,
      rewardAmount: Number(referral.rewardAmount ?? 0),
      status: referral.status,
      walletCredited: referral.status === "REWARDED" && referral.rewardedAt !== null,
    };
  });

  return { rows, total, truncated: isAll && total > EXPORT_ROW_CAP };
}
