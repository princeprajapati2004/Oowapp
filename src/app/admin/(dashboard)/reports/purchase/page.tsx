import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listSuppliersForPicker } from "@/lib/services/purchase";
import { PurchaseReportView } from "@/components/admin/reports/purchase/purchase-report-view";

export default async function PurchaseReportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [shop, suppliers] = await Promise.all([getShopById(session.shopId), listSuppliersForPicker(session.shopId)]);

  return (
    <PurchaseReportView
      shop={{
        businessName: shop.businessName,
        address: shop.address,
        gstNumber: shop.gstNumber,
        phone: shop.phone,
      }}
      suppliers={suppliers}
    />
  );
}
