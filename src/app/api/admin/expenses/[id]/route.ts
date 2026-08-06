import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { expenseSchema } from "@/lib/validation/expense";
import { db } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;

    const existing = await db.expense.findFirst({
      where: { id, shopId: session.shopId },
    });
    if (!existing) throw new NotFoundError("Expense not found");

    const body = await request.json();
    const input = expenseSchema.partial().parse(body);

    const expense = await db.expense.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
        ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    return NextResponse.json({
      ...expense,
      amount: Number(expense.amount),
      date: expense.date.toISOString(),
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;

    const existing = await db.expense.findFirst({
      where: { id, shopId: session.shopId },
    });
    if (!existing) throw new NotFoundError("Expense not found");

    await db.expense.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
