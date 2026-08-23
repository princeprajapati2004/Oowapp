import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { getExpense } from "@/lib/services/expense";
import { listPartiesForPicker } from "@/lib/services/party";
import { NotFoundError } from "@/lib/api-utils";
import { ExpenseDetail } from "@/components/admin/expense-detail";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;

  let expense;
  try {
    expense = await getExpense(session.shopId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [shop, parties] = await Promise.all([
    getShopById(session.shopId),
    listPartiesForPicker(session.shopId),
  ]);

  return <ExpenseDetail initialExpense={expense} parties={parties} currency={shop.currency} />;
}
