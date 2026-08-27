import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listPartiesForPicker } from "@/lib/services/party";
import { ExpenseReportView } from "@/components/admin/reports/expenses/expense-report-view";

export default async function ExpenseReportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [shop, parties] = await Promise.all([getShopById(session.shopId), listPartiesForPicker(session.shopId)]);

  return (
    <ExpenseReportView
      shop={{
        businessName: shop.businessName,
        address: shop.address,
        gstNumber: shop.gstNumber,
        phone: shop.phone,
      }}
      parties={parties}
    />
  );
}
