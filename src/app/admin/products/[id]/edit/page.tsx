import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getProduct } from "@/lib/services/product";
import { listCategories } from "@/lib/services/category";
import { getShopById } from "@/lib/services/shop";
import { getOrCreateItemSettings } from "@/lib/services/item-settings";
import { listPartiesForPicker } from "@/lib/services/party";
import { serializeProductWithCost } from "@/lib/serialize";
import { ProductFormPage } from "@/components/admin/product-form-page";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [product, categories, shop, itemSettings, parties] = await Promise.all([
    getProduct(session.shopId, id),
    listCategories(session.shopId),
    getShopById(session.shopId),
    getOrCreateItemSettings(session.shopId),
    listPartiesForPicker(session.shopId),
  ]);
  if (!product) notFound();

  return (
    <ProductFormPage
      product={serializeProductWithCost(product)}
      categories={categories}
      currency={shop.currency}
      businessType={shop.businessType}
      itemSettings={itemSettings}
      parties={parties.filter((p: (typeof parties)[number]) => p.type === "CUSTOMER")}
    />
  );
}
