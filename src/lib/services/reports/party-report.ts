import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import {
  isOutstandingOrder,
  orderOutstanding,
  orderAmount,
  computeOutstanding,
  paymentsReceivedUnallocated,
  paymentsPaidUnallocated,
} from "@/lib/services/party";
import type { Prisma } from "@/generated/prisma/client";

export interface PartyReportFilters {
  from: Date;
  to: Date;
  search?: string;
  type?: "CUSTOMER" | "SUPPLIER";
}

export interface PartyReportRow {
  id: string;
  name: string;
  phone: string;
  type: string;
  // In-range activity.
  totalOrders: number;
  totalSalesOrPurchases: number;
  paidInRange: number;
  receivedInRange: number;
  // All-time — "as of today", never date-filtered (see computeOutstanding).
  outstanding: number;
}

export interface PartyReportSummary {
  totalParties: number;
  totalOutstanding: number;
  totalReceivedInRange: number;
  totalPaidOutInRange: number;
}

function inRange(date: Date, from: Date, to: Date) {
  return date >= from && date <= to;
}

function buildWhere(shopId: string, filters: PartyReportFilters): Prisma.PartyWhereInput {
  return {
    shopId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, ...caseInsensitive() } },
            { phone: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };
}

/**
 * The one, shared, expensive computation both the summary cards and the
 * table rows are derived from — fetches every party matching the filter
 * (type/search) with its full all-time orders/payments/purchases, same
 * shape `listPartiesWithBalances` (src/lib/services/party.ts) already uses
 * for the main Parties page, then reuses that file's exact
 * isOutstandingOrder/orderOutstanding/computeOutstanding/paymentsXUnallocated
 * helpers for the all-time "outstanding" figure — never reimplemented here.
 * Unlike listPartiesWithBalances this is filtered (type/search) and also
 * derives period-scoped columns (orders/sales/paid/received "in range") by
 * filtering the same already-fetched orders/payments/purchases arrays in
 * memory, rather than firing a second set of date-scoped queries.
 */
async function computePartyReportRows(shopId: string, filters: PartyReportFilters): Promise<PartyReportRow[]> {
  const where = buildWhere(shopId, filters);
  const parties = await db.party.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      orders: { select: { grandTotal: true, discountedTotal: true, paidAmount: true, status: true, paymentStatus: true, createdAt: true } },
      payments: { select: { amount: true, direction: true, createdAt: true, allocations: { select: { id: true } } } },
      // Suppliers don't place orders in this app (see party.ts) — their
      // "Total Sales/Purchases" column instead comes from real Purchase
      // records against them, never fabricated as 0/dash when the data
      // actually exists.
      purchases: { select: { grandTotal: true, purchaseDate: true, status: true } },
    },
  });

  return parties.map((partyWithRelations) => {
    const { orders, payments, purchases, ...party } = partyWithRelations;

    // All-time outstanding — exact same math as listPartiesWithBalances.
    const unpaidOrderTotal = orders.filter(isOutstandingOrder).reduce((sum, o) => sum + orderOutstanding(o), 0);
    const receivedUnallocated = paymentsReceivedUnallocated(payments);
    const paidUnallocated = paymentsPaidUnallocated(payments);
    const outstanding = computeOutstanding(party, unpaidOrderTotal, receivedUnallocated, paidUnallocated);

    // Period-scoped activity — filtered from the same fetched arrays.
    const ordersInRange = orders.filter((o) => o.status !== "CANCELLED" && inRange(o.createdAt, filters.from, filters.to));
    const purchasesInRange = purchases.filter((p) => p.status !== "CANCELLED" && inRange(p.purchaseDate, filters.from, filters.to));
    const paymentsInRange = payments.filter((p) => inRange(p.createdAt, filters.from, filters.to));

    const totalOrders = ordersInRange.length;
    const totalSalesOrPurchases =
      party.type === "SUPPLIER"
        ? purchasesInRange.reduce((sum, p) => sum + Number(p.grandTotal), 0)
        : ordersInRange.reduce((sum, o) => sum + orderAmount(o), 0);
    const paidInRange = paymentsInRange.filter((p) => p.direction === "PAID").reduce((sum, p) => sum + Number(p.amount), 0);
    const receivedInRange = paymentsInRange.filter((p) => p.direction === "RECEIVED").reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      id: party.id,
      name: party.name,
      phone: party.phone,
      type: party.type,
      totalOrders,
      totalSalesOrPurchases,
      paidInRange,
      receivedInRange,
      outstanding,
    };
  });
}

export function summarizePartyReportRows(rows: PartyReportRow[]): PartyReportSummary {
  return {
    totalParties: rows.length,
    totalOutstanding: rows.reduce((sum, r) => sum + r.outstanding, 0),
    totalReceivedInRange: rows.reduce((sum, r) => sum + r.receivedInRange, 0),
    totalPaidOutInRange: rows.reduce((sum, r) => sum + r.paidInRange, 0),
  };
}

const EXPORT_ROW_CAP = 20_000;

/**
 * Fetches the full filtered+computed row set once, derives the summary from
 * every matching row (never just the current page — see
 * summarizePartyReportRows), then paginates in memory for the table. There's
 * no separate paginated Prisma query here (unlike expense-report.ts) because
 * the summary cards and table rows both need the same per-party, all-time
 * ledger computation — running it twice would double the DB + CPU cost for
 * no benefit.
 */
export async function getPartyReportData(
  shopId: string,
  filters: PartyReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ summary: PartyReportSummary; rows: PartyReportRow[]; total: number; truncated: boolean }> {
  const allRows = await computePartyReportRows(shopId, filters);
  const summary = summarizePartyReportRows(allRows);
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
