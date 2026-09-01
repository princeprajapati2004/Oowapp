import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { CashbookReportView } from "@/components/admin/reports/cashbook/cashbook-report-view";

export default async function CashbookReportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  return (
    <CashbookReportView
      shop={{
        businessName: shop.businessName,
        address: shop.address,
        gstNumber: shop.gstNumber,
        phone: shop.phone,
      }}
    />
  );
}
