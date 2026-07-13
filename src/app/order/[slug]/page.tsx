import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { serializeProducts, serializeTaxes } from "@/lib/serialize";
import { CustomerMenu } from "@/components/customer/customer-menu";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);

  if (!shop) {
    notFound();
  }

  const { categories, products, taxes, ...shopInfo } = shop;

  return (
    <CustomerMenu
      shop={shopInfo}
      categories={categories}
      products={serializeProducts(products)}
      taxes={serializeTaxes(taxes)}
    />
  );
}
