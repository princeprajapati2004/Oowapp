import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { ExpenseInput } from "@/lib/validation/expense";

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
}

export async function listExpenses(shopId: string, filters: ExpenseFilters = {}, take = 200) {
  const expenses = await db.expense.findMany({
    where: {
      shopId,
      ...(filters.dateFrom || filters.dateTo
        ? { date: { gte: filters.dateFrom, lte: filters.dateTo } }
        : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
      ...(filters.partyId ? { partyId: filters.partyId } : {}),
    },
    orderBy: { date: "desc" },
    take,
    include: { party: { select: VENDOR_SELECT } },
  });
  return expenses.map(serializeExpense);
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
