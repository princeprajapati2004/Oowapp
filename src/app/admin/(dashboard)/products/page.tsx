import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listProducts } from "@/lib/services/product";
import { listCategories } from "@/lib/services/category";
import { getShopById } from "@/lib/services/shop";
import { getOrCreateItemSettings } from "@/lib/services/item-settings";
import { listPartiesForPicker } from "@/lib/services/party";
import { serializeProductsWithCost } from "@/lib/serialize";
import { ProductsManager } from "@/components/admin/products-manager";

export default async function ProductsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [products, categories, shop, itemSettings, parties] = await Promise.all([
    listProducts(session.shopId),
    listCategories(session.shopId),
    getShopById(session.shopId),
    getOrCreateItemSettings(session.shopId),
    listPartiesForPicker(session.shopId),
  ]);

  return (
    <ProductsManager
      initialProducts={serializeProductsWithCost(products)}
      categories={categories}
      currency={shop.currency}
      businessType={shop.businessType}
      itemSettings={itemSettings}
      parties={parties.filter((p) => p.type === "CUSTOMER")}
    />
  );
}
