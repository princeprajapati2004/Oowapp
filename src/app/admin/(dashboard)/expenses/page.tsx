import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { searchExpenses, getExpenseQuickTotals } from "@/lib/services/expense";
import { listPartiesForPicker } from "@/lib/services/party";
import { presetToDateStrings } from "@/lib/utils/date-range";
import { ExpensesManager } from "@/components/admin/expenses-manager";
import { resolveDateRange } from "@/lib/utils/date-range";

const DEFAULT_RANGE = presetToDateStrings("this_month");

export default async function ExpensesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const range = resolveDateRange(DEFAULT_RANGE.from, DEFAULT_RANGE.to);

  const [shop, result, quickTotals, parties] = await Promise.all([
    getShopById(session.shopId),
    searchExpenses(session.shopId, { dateFrom: range.from, dateTo: range.to }, { page: 1, pageSize: 50 }),
    getExpenseQuickTotals(session.shopId),
    listPartiesForPicker(session.shopId),
  ]);

  return (
    <ExpensesManager
      initialExpenses={result.expenses}
      initialTotal={result.total}
      initialTotalAmount={result.totalAmount}
      initialQuickTotals={quickTotals}
      parties={parties}
      currency={shop.currency}
    />
  );
}
