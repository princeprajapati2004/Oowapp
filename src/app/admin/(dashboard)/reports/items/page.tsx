import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listCategories } from "@/lib/services/category";
import { ItemReportView } from "@/components/admin/reports/items/item-report-view";

export default async function ItemReportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [shop, categories] = await Promise.all([getShopById(session.shopId), listCategories(session.shopId)]);

  return (
    <ItemReportView
      shop={{
        businessName: shop.businessName,
        address: shop.address,
        gstNumber: shop.gstNumber,
        phone: shop.phone,
      }}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
