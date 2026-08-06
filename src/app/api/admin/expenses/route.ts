import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { expenseSchema } from "@/lib/validation/expense";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // e.g. "2026-08"

    let dateFilter: { gte?: Date; lt?: Date } | undefined;
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 1);
      dateFilter = { gte: start, lt: end };
    }

    const expenses = await db.expense.findMany({
      where: {
        shopId: session.shopId,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(
      expenses.map((e) => ({
        ...e,
        amount: Number(e.amount),
        date: e.date.toISOString(),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = expenseSchema.parse(body);

    const expense = await db.expense.create({
      data: {
        shopId: session.shopId,
        name: input.name,
        category: input.category,
        amount: input.amount,
        date: new Date(input.date),
        paymentMethod: input.paymentMethod,
        notes: input.notes || null,
      },
    });

    return NextResponse.json(
      {
        ...expense,
        amount: Number(expense.amount),
        date: expense.date.toISOString(),
        createdAt: expense.createdAt.toISOString(),
        updatedAt: expense.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
