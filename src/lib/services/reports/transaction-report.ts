import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";
import type { PartyPaymentMethod } from "@/generated/prisma/enums";

export interface TransactionReportFilters {
  from: Date;
  to: Date;
  search?: string;
  // Matches PAYMENT_METHODS values (CASH/UPI/GPAY/PHONEPE/CARD/DEBIT_CARD/
  // BANK_TRANSFER/COD/ONLINE/OTHER). PaymentRecord.method is a free string so
  // this is compared case-insensitively; PartyPayment.method is the narrower
  // PartyPaymentMethod enum (CASH/UPI/CARD/BANK_TRANSFER/OTHER) — a value
  // outside that enum (GPAY/PHONEPE/DEBIT_CARD/COD/ONLINE) simply can't match
  // any PartyPayment row, so that branch is skipped entirely for those.
  paymentMethod?: string;
  // "ALL" | "ORDER_PAYMENT" | "PARTY_PAYMENT" — which union branch(es) to include.
  source?: string;
}

export type TransactionSource = "order_payment" | "party_payment";

export interface TransactionReportRow {
  id: string;
  source: TransactionSource;
  date: string;
  reference: string;
  type: string;
  method: string;
  amount: number;
  notes: string | null;
}

export interface TransactionReportSummary {
  totalTransactions: number;
  totalAmount: number;
  cashCount: number;
  cashAmount: number;
  otherCount: number;
  otherAmount: number;
}

// PartyPayment.method is a closed enum — a paymentMethod filter value outside
// it (e.g. "GPAY") can never match a PartyPayment row.
const PARTY_PAYMENT_METHODS = new Set<string>(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]);

function includeOrderPayments(filters: TransactionReportFilters): boolean {
  return filters.source !== "PARTY_PAYMENT";
}

function includePartyPayments(filters: TransactionReportFilters): boolean {
  return filters.source !== "ORDER_PAYMENT";
}

function buildOrderPaymentWhere(shopId: string, filters: TransactionReportFilters): Prisma.PaymentRecordWhereInput {
  return {
    shopId,
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.paymentMethod ? { method: { equals: filters.paymentMethod, ...caseInsensitive() } } : {}),
    ...(filters.search
      ? {
          OR: [
            { transactionReference: { contains: filters.search, ...caseInsensitive() } },
            { note: { contains: filters.search, ...caseInsensitive() } },
            { order: { is: { customerName: { contains: filters.search, ...caseInsensitive() } } } },
            { order: { is: { billNumber: { contains: filters.search, ...caseInsensitive() } } } },
          ],
        }
      : {}),
  };
}

// null return means "this filter combination can never match a PartyPayment
// row" (an out-of-enum paymentMethod) — callers must skip the query entirely
// rather than pass this through to Prisma, which would throw on an invalid
// enum value.
function buildPartyPaymentWhere(shopId: string, filters: TransactionReportFilters): Prisma.PartyPaymentWhereInput | null {
  if (filters.paymentMethod && !PARTY_PAYMENT_METHODS.has(filters.paymentMethod.toUpperCase())) {
    return null;
  }
  return {
    shopId,
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.paymentMethod ? { method: filters.paymentMethod.toUpperCase() as PartyPaymentMethod } : {}),
    ...(filters.search
      ? {
          OR: [
            { note: { contains: filters.search, ...caseInsensitive() } },
            { party: { is: { name: { contains: filters.search, ...caseInsensitive() } } } },
          ],
        }
      : {}),
  };
}

export async function getTransactionReportSummary(shopId: string, filters: TransactionReportFilters): Promise<TransactionReportSummary> {
  const wantOrder = includeOrderPayments(filters);
  const wantParty = includePartyPayments(filters);
  const partyWhere = wantParty ? buildPartyPaymentWhere(shopId, filters) : null;

  const [orderPayments, partyPayments] = await Promise.all([
    wantOrder
      ? db.paymentRecord.findMany({ where: buildOrderPaymentWhere(shopId, filters), select: { amount: true, method: true } })
      : Promise.resolve([]),
    wantParty && partyWhere
      ? db.partyPayment.findMany({ where: partyWhere, select: { amount: true, method: true } })
      : Promise.resolve([]),
  ]);

  const allRows = [
    ...orderPayments.map((p) => ({ amount: Number(p.amount), method: p.method })),
    ...partyPayments.map((p) => ({ amount: Number(p.amount), method: p.method as string })),
  ];

  let totalAmount = 0;
  let cashCount = 0;
  let cashAmount = 0;
  let otherCount = 0;
  let otherAmount = 0;

  for (const row of allRows) {
    totalAmount += row.amount;
    if (row.method.toUpperCase() === "CASH") {
      cashCount += 1;
      cashAmount += row.amount;
    } else {
      otherCount += 1;
      otherAmount += row.amount;
    }
  }

  return {
    totalTransactions: allRows.length,
    totalAmount,
    cashCount,
    cashAmount,
    otherCount,
    otherAmount,
  };
}

const EXPORT_ROW_CAP = 20_000;

/**
 * Union of PaymentRecord (order/table-session sale payments) and
 * PartyPayment (khatabook/ledger payments, including purchase settlements) —
 * two structurally different Prisma models with no clean SQL UNION path
 * through the Prisma client, so each is fetched with its own where/orderBy,
 * tagged with a `source` discriminator, and merged + sorted + paginated in
 * application code instead.
 *
 * Both source queries are already ordered `createdAt desc`, so taking the
 * top `perSourceCap` rows from each is enough to correctly resolve the
 * merged top `perSourceCap` (a standard sorted-merge property: the top N of
 * A ∪ B always comes from a prefix of A and a prefix of B, each no longer
 * than N) — the merged page window is always sliced from a correctly-sorted
 * candidate set, not just capped-then-hoped-for.
 */
export async function listTransactionReportRows(
  shopId: string,
  filters: TransactionReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: TransactionReportRow[]; total: number; truncated: boolean }> {
  const wantOrder = includeOrderPayments(filters);
  const wantParty = includePartyPayments(filters);
  const orderWhere = buildOrderPaymentWhere(shopId, filters);
  const partyWhere = wantParty ? buildPartyPaymentWhere(shopId, filters) : null;

  const isAll = "all" in pagination;
  const perSourceCap = isAll ? EXPORT_ROW_CAP : Math.min(pagination.page * pagination.pageSize, EXPORT_ROW_CAP);

  const [orderTotal, partyTotal, orderRows, partyRows] = await Promise.all([
    wantOrder ? db.paymentRecord.count({ where: orderWhere }) : Promise.resolve(0),
    wantParty && partyWhere ? db.partyPayment.count({ where: partyWhere }) : Promise.resolve(0),
    wantOrder
      ? db.paymentRecord.findMany({
          where: orderWhere,
          orderBy: { createdAt: "desc" },
          take: perSourceCap,
          include: {
            order: { select: { billNumber: true, customerName: true } },
            tableSession: { select: { tableNumber: true, customerName: true } },
          },
        })
      : Promise.resolve([]),
    wantParty && partyWhere
      ? db.partyPayment.findMany({
          where: partyWhere,
          orderBy: { createdAt: "desc" },
          take: perSourceCap,
          include: { party: { select: { name: true, type: true } } },
        })
      : Promise.resolve([]),
  ]);

  const unifiedOrderRows: TransactionReportRow[] = orderRows.map((p): TransactionReportRow => ({
    id: p.id,
    source: "order_payment",
    date: p.createdAt.toISOString(),
    reference: p.order
      ? `${p.order.billNumber}${p.order.customerName ? ` - ${p.order.customerName}` : ""}`
      : p.tableSession
        ? `Table ${p.tableSession.tableNumber}${p.tableSession.customerName ? ` - ${p.tableSession.customerName}` : ""}`
        : "-",
    type: "Sale Payment",
    method: p.method,
    amount: Number(p.amount),
    notes: p.note,
  }));

  const unifiedPartyRows: TransactionReportRow[] = partyRows.map((p): TransactionReportRow => ({
    id: p.id,
    source: "party_payment",
    date: p.createdAt.toISOString(),
    reference: p.party.name,
    type: p.direction === "RECEIVED" ? "Received" : "Paid",
    method: p.method,
    amount: Number(p.amount),
    notes: p.note,
  }));

  const merged = [...unifiedOrderRows, ...unifiedPartyRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = orderTotal + partyTotal;

  if (isAll) {
    const rows = merged.slice(0, EXPORT_ROW_CAP);
    return { rows, total, truncated: total > EXPORT_ROW_CAP };
  }

  const start = (pagination.page - 1) * pagination.pageSize;
  const rows = merged.slice(start, start + pagination.pageSize);
  return { rows, total, truncated: false };
}
