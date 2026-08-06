import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { ExpensesManager } from "@/components/admin/expenses-manager";

export default async function ExpensesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const expenses = await db.expense.findMany({
    where: { shopId: session.shopId },
    orderBy: { date: "desc" },
    take: 200,
  });

  return (
    <ExpensesManager
      initialExpenses={expenses.map((e) => ({
        ...e,
        amount: Number(e.amount),
        date: e.date.toISOString(),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }))}
      currency={shop.currency}
    />
  );
}
