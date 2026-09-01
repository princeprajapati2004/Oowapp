import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { ProfitReportView } from "@/components/admin/reports/profit/profit-report-view";

export default async function ProfitReportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  return (
    <ProfitReportView
      shop={{
        businessName: shop.businessName,
        address: shop.address,
        gstNumber: shop.gstNumber,
        phone: shop.phone,
      }}
    />
  );
}
