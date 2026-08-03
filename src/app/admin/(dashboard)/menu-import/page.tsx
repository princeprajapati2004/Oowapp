import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listCategories } from "@/lib/services/category";
import { MenuImportManager } from "@/components/admin/menu-import-manager";

export default async function MenuImportPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [shop, categories] = await Promise.all([
    getShopById(session.shopId),
    listCategories(session.shopId),
  ]);

  return (
    <MenuImportManager categories={categories} currency={shop.currency} businessType={shop.businessType} />
  );
}
