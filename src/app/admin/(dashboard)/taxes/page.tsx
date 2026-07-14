import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listTaxes } from "@/lib/services/tax";
import { listCategories } from "@/lib/services/category";
import { getShopById } from "@/lib/services/shop";
import { serializeTaxes } from "@/lib/serialize";
import { TaxesManager } from "@/components/admin/taxes-manager";

export default async function TaxesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [taxes, categories, shop] = await Promise.all([
    listTaxes(session.shopId),
    listCategories(session.shopId),
    getShopById(session.shopId),
  ]);

  return (
    <TaxesManager initialTaxes={serializeTaxes(taxes)} categories={categories} currency={shop.currency} />
  );
}
