import { listCashMovements, describeCashMovementType, type CashMovement, type CashMovementSource } from "@/lib/services/reports/cash-movements";

export interface CashbookReportFilters {
  from: Date;
  to: Date;
  // Nice-to-have display filters — narrow which rows are *shown*.
  // Opening/closing balance and each row's runningBalance are always
  // computed over the FULL unfiltered period so the ledger math stays
  // honest regardless of what's currently filtered.
  source?: CashMovementSource | "ALL";
  search?: string;
}

export interface CashbookReportSummary {
  openingBalance: number;
  totalCashIn: number;
  totalCashOut: number;
  closingBalance: number;
}

export interface CashbookReportRow extends CashMovement {
  type: string; // friendly label, see describeCashMovementType
  cashIn: number;
  cashOut: number;
  runningBalance: number;
}

// Hardcoded far-past lower bound for "all-time up to X" balance queries — a
// simple, honest stand-in for "since this shop began," per the Reports
// Center spec (no per-shop createdAt tracking needed for this).
const LEDGER_START = new Date(2000, 0, 1);

async function computeOpeningBalance(shopId: string, from: Date): Promise<number> {
  const priorMovements = await listCashMovements(shopId, LEDGER_START, new Date(from.getTime() - 1));
  return priorMovements.reduce((sum, m) => sum + (m.direction === "IN" ? m.amount : -m.amount), 0);
}

export async function getCashbookReportSummary(shopId: string, filters: Pick<CashbookReportFilters, "from" | "to">): Promise<CashbookReportSummary> {
  const [openingBalance, periodMovements] = await Promise.all([
    computeOpeningBalance(shopId, filters.from),
    listCashMovements(shopId, filters.from, filters.to),
  ]);

  let totalCashIn = 0;
  let totalCashOut = 0;
  for (const m of periodMovements) {
    if (m.direction === "IN") totalCashIn += m.amount;
    else totalCashOut += m.amount;
  }

  return {
    openingBalance,
    totalCashIn,
    totalCashOut,
    closingBalance: openingBalance + totalCashIn - totalCashOut,
  };
}

const EXPORT_ROW_CAP = 20_000;

/**
 * Running balance is computed once over the FULL chronological period list
 * (ascending, oldest first — a cashbook reads top-to-bottom) before any
 * source filter or pagination is applied. Filtering by source only narrows
 * which rows are displayed; each surviving row keeps the runningBalance it
 * was assigned against the complete ledger, so it always reflects the
 * shop's true cash position at that point in time. Pagination only slices
 * the already-computed list — it is never recomputed per-page from a fresh
 * opening balance.
 */
export async function listCashbookReportRows(
  shopId: string,
  filters: CashbookReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: CashbookReportRow[]; total: number; truncated: boolean }> {
  const [openingBalance, periodMovements] = await Promise.all([
    computeOpeningBalance(shopId, filters.from),
    listCashMovements(shopId, filters.from, filters.to), // already ascending
  ]);

  let running = openingBalance;
  const allRows: CashbookReportRow[] = periodMovements.map((m) => {
    const cashIn = m.direction === "IN" ? m.amount : 0;
    const cashOut = m.direction === "OUT" ? m.amount : 0;
    running += cashIn - cashOut;
    return { ...m, type: describeCashMovementType(m), cashIn, cashOut, runningBalance: running };
  });

  let filtered = filters.source && filters.source !== "ALL" ? allRows.filter((r) => r.source === filters.source) : allRows;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((r) => r.description.toLowerCase().includes(q) || r.type.toLowerCase().includes(q));
  }

  const total = filtered.length;
  const isAll = "all" in pagination;
  if (isAll) {
    return { rows: filtered.slice(0, EXPORT_ROW_CAP), total, truncated: total > EXPORT_ROW_CAP };
  }
  const start = (pagination.page - 1) * pagination.pageSize;
  return { rows: filtered.slice(start, start + pagination.pageSize), total, truncated: false };
}
