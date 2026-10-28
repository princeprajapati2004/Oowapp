import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { PreparationReportView } from "@/components/admin/reports/preparation/preparation-report-view";

export default async function PreparationReportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  return (
    <PreparationReportView
      shop={{
        businessName: shop.businessName,
        address: shop.address,
        gstNumber: shop.gstNumber,
        phone: shop.phone,
      }}
    />
  );
}
