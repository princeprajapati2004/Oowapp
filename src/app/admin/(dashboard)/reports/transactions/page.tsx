import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { TransactionReportView } from "@/components/admin/reports/transactions/transaction-report-view";

export default async function TransactionReportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  return (
    <TransactionReportView
      shop={{
        businessName: shop.businessName,
        address: shop.address,
        gstNumber: shop.gstNumber,
        phone: shop.phone,
      }}
    />
  );
}
