/**
 * Balance Sheet — a point-in-time snapshot ("as of" a single date), unlike
 * every other report here which is period-flow framed. Reuses the shared
 * date-range filter bar for UI consistency (see balance-sheet-report-view.tsx),
 * but only `to` is meaningful — it's treated as the "as of" instant; `from`
 * is accepted and ignored so the same ReportFilterBar component works
 * unmodified.
 *
 * Every figure here is either exact-and-real or explicitly labeled as
 * unavailable — never fabricated. See the Equity section for the one place
 * this schema genuinely has no data to report.
 */
import { db } from "@/lib/db";
import { isOutstandingOrder, orderOutstanding } from "@/lib/services/party";
import { getCashBankReportSummary } from "@/lib/services/reports/cash-bank-report";
import { round2 } from "@/lib/services/billing";

// Same "beginning of time" lower bound used by cashbook-report.ts /
// cash-bank-report.ts — Cash/Bank on a balance sheet must be the true
// all-time running balance, not scoped to any period.
const LEDGER_START = new Date(2000, 0, 1);

export interface BalanceSheetLineItem {
  section: "Assets" | "Liabilities" | "Equity";
  label: string;
  value: number | null; // null renders as "Not configured" in the UI, never 0
  hint?: string;
}

export interface BalanceSheetData {
  asOfDate: string; // ISO
  asOfLabel: string; // "27 Aug 2026"
  cash: number;
  bank: number;
  inventoryValue: number;
  inventoryExcludedCount: number;
  accountsReceivable: number;
  totalAssets: number;
  accountsPayable: number;
  customerAdvances: number;
  totalLiabilities: number;
  impliedEquity: number;
  lineItems: BalanceSheetLineItem[];
}

const ASOF_LABEL_FORMAT = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * Accounts Receivable — every non-cancelled Order shop-wide with a real
 * outstanding balance, using the exact same isOutstandingOrder/
 * orderOutstanding helpers party.ts and party-report.ts already rely on.
 * Deliberately queried directly off Order (not routed through Party) so an
 * outstanding order with no linked Party record is still counted — going
 * through Party would silently under-report receivables for guest/unlinked
 * orders.
 */
async function computeAccountsReceivable(shopId: string): Promise<number> {
  const orders = await db.order.findMany({
    where: { shopId, status: { not: "CANCELLED" } },
    select: { grandTotal: true, discountedTotal: true, paidAmount: true, status: true, paymentStatus: true },
  });
  return round2(orders.filter(isOutstandingOrder).reduce((sum, o) => sum + orderOutstanding(o), 0));
}

/**
 * Accounts Payable — unpaid balance across every RECORDED (non-cancelled)
 * Purchase, shop-wide. Deliberately NOT computed via the generic Party
 * ledger (computeOutstanding): that formula only reacts to explicit
 * PartyPayment entries, and a Purchase's own liability (grandTotal minus
 * what's actually been paid on it) never automatically posts a matching
 * "received" ledger line — going through the Party formula would produce an
 * inconsistent, understated payables figure. Purchase.grandTotal −
 * Purchase.paidAmount is the direct, traceable source of truth instead
 * (identical math to what the Purchase Report's own "Pending" column uses).
 */
async function computeAccountsPayable(shopId: string): Promise<number> {
  const purchases = await db.purchase.findMany({
    where: { shopId, status: "RECORDED" },
    select: { grandTotal: true, paidAmount: true },
  });
  return round2(purchases.reduce((sum, p) => sum + Math.max(0, Number(p.grandTotal) - Number(p.paidAmount ?? 0)), 0));
}

/** Customer wallet balances — real money owed back to customers as store credit, a genuine liability. */
async function computeCustomerAdvances(shopId: string): Promise<number> {
  const agg = await db.customer.aggregate({ where: { shopId }, _sum: { walletBalance: true } });
  return round2(Number(agg._sum.walletBalance ?? 0));
}

/** Inventory value — Σ stock × costPrice across products where both are known; never estimated for the rest. */
async function computeInventoryValue(shopId: string): Promise<{ value: number; excludedCount: number }> {
  const products = await db.product.findMany({ where: { shopId }, select: { stock: true, costPrice: true } });
  let value = 0;
  let excludedCount = 0;
  for (const p of products) {
    if (p.stock != null && p.costPrice != null) {
      value += p.stock * Number(p.costPrice);
    } else {
      excludedCount += 1;
    }
  }
  return { value: round2(value), excludedCount };
}

export async function getBalanceSheet(shopId: string, asOfDate: Date): Promise<BalanceSheetData> {
  const [cashBank, receivable, payable, advances, inventory] = await Promise.all([
    getCashBankReportSummary(shopId, { from: LEDGER_START, to: asOfDate }),
    computeAccountsReceivable(shopId),
    computeAccountsPayable(shopId),
    computeCustomerAdvances(shopId),
    computeInventoryValue(shopId),
  ]);

  const cash = round2(cashBank.currentCash);
  const bank = round2(cashBank.currentBank);
  const totalAssets = round2(cash + bank + inventory.value + receivable);
  const totalLiabilities = round2(payable + advances);
  const impliedEquity = round2(totalAssets - totalLiabilities);

  const lineItems: BalanceSheetLineItem[] = [
    { section: "Assets", label: "Cash", value: cash },
    { section: "Assets", label: "Bank / Digital", value: bank },
    {
      section: "Assets",
      label: "Inventory Value",
      value: inventory.value,
      hint: inventory.excludedCount > 0 ? `${inventory.excludedCount} product(s) excluded — missing stock or cost price` : undefined,
    },
    { section: "Assets", label: "Accounts Receivable (Customer Dues)", value: receivable },
    { section: "Assets", label: "Total Assets", value: totalAssets },
    { section: "Liabilities", label: "Accounts Payable (Supplier Dues)", value: payable },
    { section: "Liabilities", label: "Customer Advances (Wallet Balances)", value: advances },
    { section: "Liabilities", label: "Total Liabilities", value: totalLiabilities },
    {
      section: "Equity",
      label: "Owner Capital",
      value: null,
      hint: "Oowapp does not track owner capital contributions.",
    },
    {
      section: "Equity",
      label: "Retained Earnings",
      value: null,
      hint: "Oowapp does not track retained-earnings entries.",
    },
    {
      section: "Equity",
      label: "Implied Equity (Assets − Liabilities)",
      value: impliedEquity,
      hint: "Not validated against owner-entered capital records — see Owner Capital / Retained Earnings above.",
    },
  ];

  return {
    asOfDate: asOfDate.toISOString(),
    asOfLabel: ASOF_LABEL_FORMAT.format(asOfDate),
    cash,
    bank,
    inventoryValue: inventory.value,
    inventoryExcludedCount: inventory.excludedCount,
    accountsReceivable: receivable,
    totalAssets,
    accountsPayable: payable,
    customerAdvances: advances,
    totalLiabilities,
    impliedEquity,
    lineItems,
  };
}
