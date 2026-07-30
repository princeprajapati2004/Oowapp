import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { serializeProducts, serializeTaxes } from "@/lib/serialize";
import { resolveCustomerIdentity, resolveActiveTableSession } from "@/lib/services/customer-order-session";
import { db } from "@/lib/db";
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

  const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });

  const { customer, verifiedPhone } = shopRow
    ? await resolveCustomerIdentity(shopRow.id)
    : { customer: null, verifiedPhone: null };

  const activeSession = shopRow
    ? await resolveActiveTableSession({ shopId: shopRow.id, enableTableQr: shop.enableTableQr, tableNumber: prefilledTable })
    : null;

  return (
    <CustomerMenu
      shop={shopInfo}
      categories={categories}
      products={serializeProducts(products)}
      taxes={serializeTaxes(taxes)}
      prefilledTable={prefilledTable}
      customer={customer}
      activeSession={activeSession}
      verifiedPhone={verifiedPhone}
    />
  );
}
