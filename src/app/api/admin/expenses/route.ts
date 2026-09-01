import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { expenseSchema } from "@/lib/validation/expense";
import { searchExpenses, createExpense } from "@/lib/services/expense";
import { resolveDateRange } from "@/lib/utils/date-range";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const category = searchParams.get("category");
    const paymentMethod = searchParams.get("paymentMethod");
    const partyId = searchParams.get("partyId");
    const search = searchParams.get("search");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50), 1), 200);

    // No from/to = "all time" (e.g. the "Clear Filter" state) — never
    // required, since some callers/quick-links intentionally want everything.
    const range = fromParam && toParam ? resolveDateRange(fromParam, toParam) : null;

    const result = await searchExpenses(
      session.shopId,
      {
        dateFrom: range?.from,
        dateTo: range?.to,
        category: category || undefined,
        paymentMethod: paymentMethod || undefined,
        partyId: partyId || undefined,
        search: search || undefined,
      },
      { page, pageSize }
    );

    return NextResponse.json({
      ...result,
      page,
      pageSize,
      range: range ? { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label } : null,
    });
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
