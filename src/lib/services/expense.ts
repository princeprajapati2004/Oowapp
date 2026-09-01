import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import { caseInsensitive } from "@/lib/db-provider";
import { presetToDateStrings, resolveDateRange } from "@/lib/utils/date-range";
import type { ExpenseInput } from "@/lib/validation/expense";
import type { Prisma } from "@/generated/prisma/client";

const VENDOR_SELECT = { id: true, name: true, phone: true, type: true } as const;

function serializeExpense<
  T extends { amount: unknown; date: unknown; createdAt: unknown; updatedAt: unknown },
>(expense: T) {
  const { amount, date, createdAt, updatedAt, ...rest } = expense;
  return {
    ...rest,
    amount: Number(amount),
    date: (date as Date).toISOString(),
    createdAt: (createdAt as Date).toISOString(),
    updatedAt: (updatedAt as Date).toISOString(),
  };
}

export interface ExpenseFilters {
  dateFrom?: Date;
  dateTo?: Date;
  category?: string;
  paymentMethod?: string;
  partyId?: string;
  search?: string;
}

function buildExpenseWhere(shopId: string, filters: ExpenseFilters): Prisma.ExpenseWhereInput {
  return {
    shopId,
    ...(filters.dateFrom || filters.dateTo
      ? { date: { gte: filters.dateFrom, lte: filters.dateTo } }
      : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.partyId ? { partyId: filters.partyId } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, ...caseInsensitive() } },
            { category: { contains: filters.search, ...caseInsensitive() } },
            { transactionReference: { contains: filters.search, ...caseInsensitive() } },
            { notes: { contains: filters.search, ...caseInsensitive() } },
            { party: { name: { contains: filters.search, ...caseInsensitive() } } },
          ],
        }
      : {}),
  };
}

export async function listExpenses(shopId: string, filters: ExpenseFilters = {}, take = 200) {
  const expenses = await db.expense.findMany({
    where: buildExpenseWhere(shopId, filters),
    orderBy: { date: "desc" },
    take,
    include: { party: { select: VENDOR_SELECT } },
  });
  return expenses.map(serializeExpense);
}

/**
 * Server-side paginated + aggregated expense search — backs the Expense page's
 * date-filter icon so a shop with thousands of expenses never has to fetch
 * (or client-filter) more than one page at a time. totalAmount/count are a
 * real DB aggregate over the full filtered set, not derived from the page
 * of rows returned.
 */
export async function searchExpenses(
  shopId: string,
  filters: ExpenseFilters,
  pagination: { page: number; pageSize: number }
) {
  const where = buildExpenseWhere(shopId, filters);
  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, agg, expenses] = await Promise.all([
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
    db.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: { party: { select: VENDOR_SELECT } },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    expenses: expenses.map(serializeExpense),
    total,
    totalAmount: Number(agg._sum.amount ?? 0),
  };
}

export interface ExpenseQuickTotals {
  today: number;
  week: number;
  month: number;
  year: number;
}

// Independent of whatever date filter is active on the page — these are the
// 4 fixed-period shortcut cards at the top of the Expense page, each backed
// by its own real DB aggregate (not the current filtered/paginated result
// set), same IST-safe day-boundary convention as Reports Center.
export async function getExpenseQuickTotals(shopId: string): Promise<ExpenseQuickTotals> {
  const presets = ["today", "this_week", "this_month", "this_year"] as const;
  const [today, week, month, year] = await Promise.all(
    presets.map(async (preset) => {
      const { from, to } = presetToDateStrings(preset);
      const range = resolveDateRange(from, to);
      const agg = await db.expense.aggregate({
        where: { shopId, date: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
      });
      return Number(agg._sum.amount ?? 0);
    })
  );
  return { today, week, month, year };
}

async function assertOwnedExpense(shopId: string, id: string) {
  const expense = await db.expense.findFirst({ where: { id, shopId } });
  if (!expense) throw new NotFoundError("Expense not found");
  return expense;
}

export async function getExpense(shopId: string, id: string) {
  const expense = await db.expense.findFirst({
    where: { id, shopId },
    include: { party: { select: VENDOR_SELECT } },
  });
  if (!expense) throw new NotFoundError("Expense not found");
  return serializeExpense(expense);
}

async function assertVendorBelongsToShop(shopId: string, partyId: string) {
  const party = await db.party.findFirst({ where: { id: partyId, shopId } });
  if (!party) throw new NotFoundError("Vendor not found");
}

// Only used for updates — create() builds its data object directly since
// every required field is guaranteed present on the full ExpenseInput type.
function toExpensePatch(input: Partial<ExpenseInput>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
    ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.transactionReference !== undefined
      ? { transactionReference: input.transactionReference || null }
      : {}),
    ...(input.partyId !== undefined ? { partyId: input.partyId || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
  };
}

export async function createExpense(shopId: string, createdBy: string, input: ExpenseInput) {
  if (input.partyId) await assertVendorBelongsToShop(shopId, input.partyId);
  const expense = await db.expense.create({
    data: {
      shopId,
      createdBy,
      name: input.name,
      category: input.category,
      amount: input.amount,
      date: new Date(input.date),
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference || null,
      partyId: input.partyId || null,
      notes: input.notes || null,
    },
    include: { party: { select: VENDOR_SELECT } },
  });
  return serializeExpense(expense);
}

export async function updateExpense(shopId: string, id: string, input: Partial<ExpenseInput>) {
  await assertOwnedExpense(shopId, id);
  if (input.partyId) await assertVendorBelongsToShop(shopId, input.partyId);
  const expense = await db.expense.update({
    where: { id },
    data: toExpensePatch(input),
    include: { party: { select: VENDOR_SELECT } },
  });
  return serializeExpense(expense);
}

export async function deleteExpense(shopId: string, id: string) {
  await assertOwnedExpense(shopId, id);
  await db.expense.delete({ where: { id } });
}
