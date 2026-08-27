import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import type { Prisma } from "@/generated/prisma/client";

export interface ExpenseReportFilters {
  from: Date;
  to: Date;
  search?: string;
  category?: string;
  paymentMethod?: string;
  partyId?: string;
}

export interface ExpenseReportRow {
  id: string;
  date: string;
  name: string;
  category: string;
  partyName: string | null;
  paymentMethod: string;
  transactionReference: string | null;
  amount: number;
  notes: string | null;
}

// Expense has no paid/pending status — recording an expense IS the outflow
// (there's no "pending expense" concept in this schema), so the summary
// only shows figures that actually exist rather than fabricating a
// paid/pending split the spec's generic template implies.
export interface ExpenseReportSummary {
  totalExpenses: number;
  expenseCount: number;
  thisMonthTotal: number;
  averageExpense: number;
}

function buildWhere(shopId: string, filters: ExpenseReportFilters): Prisma.ExpenseWhereInput {
  return {
    shopId,
    date: { gte: filters.from, lte: filters.to },
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.partyId ? { partyId: filters.partyId } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, ...caseInsensitive() } },
            { notes: { contains: filters.search, ...caseInsensitive() } },
            { transactionReference: { contains: filters.search, ...caseInsensitive() } },
          ],
        }
      : {}),
  };
}

export async function getExpenseReportSummary(shopId: string, filters: ExpenseReportFilters): Promise<ExpenseReportSummary> {
  const where = buildWhere(shopId, filters);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // "This Month" keeps every other active filter (category/payment/vendor/
  // search) but overrides the date-range filter with a fixed calendar-month
  // boundary — a stable reference figure alongside whatever date range the
  // user has picked, not a duplicate of it.
  const monthWhere: Prisma.ExpenseWhereInput = { ...where, date: { gte: monthStart } };

  const [agg, monthAgg] = await Promise.all([
    db.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({ where: monthWhere, _sum: { amount: true } }),
  ]);

  const totalExpenses = Number(agg._sum.amount ?? 0);
  const expenseCount = agg._count;
  return {
    totalExpenses,
    expenseCount,
    thisMonthTotal: Number(monthAgg._sum.amount ?? 0),
    averageExpense: expenseCount > 0 ? totalExpenses / expenseCount : 0,
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function listExpenseReportRows(
  shopId: string,
  filters: ExpenseReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: ExpenseReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const isAll = "all" in pagination;
  const skip = isAll ? undefined : (pagination.page - 1) * pagination.pageSize;
  const take = isAll ? EXPORT_ROW_CAP : pagination.pageSize;

  const [total, expenses] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: { party: { select: { name: true } } },
      skip,
      take,
    }),
  ]);

  const rows: ExpenseReportRow[] = expenses.map((expense) => ({
    id: expense.id,
    date: expense.date.toISOString(),
    name: expense.name,
    category: expense.category,
    partyName: expense.party?.name ?? null,
    paymentMethod: expense.paymentMethod,
    transactionReference: expense.transactionReference,
    amount: Number(expense.amount),
    notes: expense.notes,
  }));

  return { rows, total, truncated: isAll && total > EXPORT_ROW_CAP };
}
