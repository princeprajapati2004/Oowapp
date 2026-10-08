import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listCategories } from "@/lib/services/category";
import { getShopById } from "@/lib/services/shop";
import { getOrCreateItemSettings } from "@/lib/services/item-settings";
import { listPartiesForPicker } from "@/lib/services/party";
import { ProductFormPage } from "@/components/admin/product-form-page";

export default async function NewProductPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [categories, shop, itemSettings, parties] = await Promise.all([
    listCategories(session.shopId),
    getShopById(session.shopId),
    getOrCreateItemSettings(session.shopId),
    listPartiesForPicker(session.shopId),
  ]);

  // Mirrors the old "Add product" button's disabled-when-no-categories
  // guard — there's nothing to select on this form without one.
  if (categories.length === 0) redirect("/admin/products");

  return (
    <ProductFormPage
      categories={categories}
      currency={shop.currency}
      businessType={shop.businessType}
      itemSettings={itemSettings}
      parties={parties.filter((p: (typeof parties)[number]) => p.type === "CUSTOMER")}
    />
  );
}
