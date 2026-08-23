import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { expenseSchema } from "@/lib/validation/expense";
import { listExpenses, createExpense } from "@/lib/services/expense";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // e.g. "2026-08"
    const category = searchParams.get("category");
    const paymentMethod = searchParams.get("paymentMethod");
    const partyId = searchParams.get("partyId");

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      dateFrom = new Date(year, mon - 1, 1);
      dateTo = new Date(year, mon, 1, 0, 0, 0, -1);
    }

    const expenses = await listExpenses(session.shopId, {
      dateFrom,
      dateTo,
      category: category || undefined,
      paymentMethod: paymentMethod || undefined,
      partyId: partyId || undefined,
    });

    return NextResponse.json(expenses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = expenseSchema.parse(body);

    const expense = await createExpense(session.shopId, session.adminId, input);

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
