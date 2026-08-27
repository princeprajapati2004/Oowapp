import { listCashMovements, describeCashMovementType, type CashMovement } from "@/lib/services/reports/cash-movements";
import type { CashBankBucket } from "@/lib/utils/cash-bank-bucket";

export interface CashBankReportFilters {
  from: Date;
  to: Date;
  bucket?: CashBankBucket | "ALL";
  search?: string;
}

export interface CashBankReportSummary {
  openingCash: number;
  cashIn: number;
  cashOut: number;
  currentCash: number;
  openingBank: number;
  bankIn: number;
  bankOut: number;
  currentBank: number;
}

export interface CashBankReportRow extends CashMovement {
  type: string; // friendly label, see describeCashMovementType
  amountIn: number;
  amountOut: number;
}

// Same hardcoded "beginning of time" lower bound as cashbook-report.ts, kept
// as a separate constant here since the two report services are independent
// call sites into the shared listCashMovements() helper.
const LEDGER_START = new Date(2000, 0, 1);

function sumBucket(movements: CashMovement[], bucket: CashBankBucket): number {
  let total = 0;
  for (const m of movements) {
    if (m.bucket !== bucket) continue;
    total += m.direction === "IN" ? m.amount : -m.amount;
  }
  return total;
}

export async function getCashBankReportSummary(shopId: string, filters: Pick<CashBankReportFilters, "from" | "to">): Promise<CashBankReportSummary> {
  const [priorMovements, periodMovements] = await Promise.all([
    listCashMovements(shopId, LEDGER_START, new Date(filters.from.getTime() - 1)),
    listCashMovements(shopId, filters.from, filters.to),
  ]);

  const openingCash = sumBucket(priorMovements, "CASH");
  const openingBank = sumBucket(priorMovements, "BANK");

  let cashIn = 0;
  let cashOut = 0;
  let bankIn = 0;
  let bankOut = 0;
  for (const m of periodMovements) {
    if (m.bucket === "CASH") {
      if (m.direction === "IN") cashIn += m.amount;
      else cashOut += m.amount;
    } else if (m.bucket === "BANK") {
      if (m.direction === "IN") bankIn += m.amount;
      else bankOut += m.amount;
    }
  }

  return {
    openingCash,
    cashIn,
    cashOut,
    currentCash: openingCash + cashIn - cashOut,
    openingBank,
    bankIn,
    bankOut,
    currentBank: openingBank + bankIn - bankOut,
  };
}

const EXPORT_ROW_CAP = 20_000;

/**
 * Bucketed snapshot + detail table — unlike the Cashbook report this is NOT
 * a running-balance ledger, so rows are sorted newest-first like every other
 * report and can be freely filtered/paginated independently.
 */
export async function listCashBankReportRows(
  shopId: string,
  filters: CashBankReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: CashBankReportRow[]; total: number; truncated: boolean }> {
  const periodMovements = await listCashMovements(shopId, filters.from, filters.to);

  let filtered = filters.bucket && filters.bucket !== "ALL" ? periodMovements.filter((m) => m.bucket === filters.bucket) : periodMovements;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((m) => m.description.toLowerCase().includes(q));
  }

  const sorted = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const rows: CashBankReportRow[] = sorted.map((m) => ({
    ...m,
    type: describeCashMovementType(m),
    amountIn: m.direction === "IN" ? m.amount : 0,
    amountOut: m.direction === "OUT" ? m.amount : 0,
  }));

  const total = rows.length;
  const isAll = "all" in pagination;
  if (isAll) {
    return { rows: rows.slice(0, EXPORT_ROW_CAP), total, truncated: total > EXPORT_ROW_CAP };
  }
  const start = (pagination.page - 1) * pagination.pageSize;
  return { rows: rows.slice(start, start + pagination.pageSize), total, truncated: false };
}
