import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { serializeProducts } from "@/lib/serialize";
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
  // taxes carries Prisma Decimal fields and isn't needed here — the bill math
  // lives on the Current Order page (/order/[slug]/bill), which fetches its own copy.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { categories, products, taxes: _t, ...shopInfo } = shop;

  const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });

  const { customer } = shopRow
    ? await resolveCustomerIdentity(shopRow.id)
    : { customer: null };

  const activeSession = shopRow
    ? await resolveActiveTableSession({ shopId: shopRow.id, enableTableQr: shop.enableTableQr, tableNumber: prefilledTable })
    : null;

  return (
    <CustomerMenu
      shop={shopInfo}
      categories={categories}
      products={serializeProducts(products)}
      prefilledTable={prefilledTable}
      customer={customer}
      activeSession={activeSession}
    />
  );
}
