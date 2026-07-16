import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { serializeProducts, serializeTaxes } from "@/lib/serialize";
import { CustomerMenu } from "@/components/customer/customer-menu";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const [{ slug }, resolvedSearch] = await Promise.all([params, searchParams]);
  const shop = await getPublicShopBundle(slug);

  if (!shop) {
    notFound();
  }

  const prefilledTable = resolvedSearch.table?.trim() || undefined;
  const { categories, products, taxes, ...shopInfo } = shop;

  return (
    <CustomerMenu
      shop={shopInfo}
      categories={categories}
      products={serializeProducts(products)}
      taxes={serializeTaxes(taxes)}
      prefilledTable={prefilledTable}
    />
  );
}
