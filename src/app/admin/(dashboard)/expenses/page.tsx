import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listExpenses } from "@/lib/services/expense";
import { listPartiesForPicker } from "@/lib/services/party";
import { ExpensesManager } from "@/components/admin/expenses-manager";

export default async function ExpensesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [shop, expenses, parties] = await Promise.all([
    getShopById(session.shopId),
    listExpenses(session.shopId),
    listPartiesForPicker(session.shopId),
  ]);

  return (
    <ExpensesManager
      initialExpenses={expenses}
      parties={parties}
      currency={shop.currency}
    />
  );
}
