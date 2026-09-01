import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { PurchasesListView } from "@/components/admin/purchases/purchases-list-view";

export default async function PurchasesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return <PurchasesListView />;
}
