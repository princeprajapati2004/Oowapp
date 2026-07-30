import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { serializeTaxes } from "@/lib/serialize";
import { resolveCustomerIdentity, resolveActiveTableSession } from "@/lib/services/customer-order-session";
import { db } from "@/lib/db";
import { FinalBillPage } from "@/components/customer/final-bill-page";

export default async function BillPage({
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
  // categories/products carry Prisma Decimal price fields, which can't cross
  // the Server->Client boundary — this page doesn't need them, unlike the
  // menu page which serializes and forwards them.
  const { categories: _categories, products: _products, taxes, ...shopInfo } = shop;

  const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });

  const { customer, verifiedPhone } = shopRow
    ? await resolveCustomerIdentity(shopRow.id)
    : { customer: null, verifiedPhone: null };

  const activeSession = shopRow
    ? await resolveActiveTableSession({ shopId: shopRow.id, enableTableQr: shop.enableTableQr, tableNumber: prefilledTable })
    : null;

  return (
    <FinalBillPage
      shop={shopInfo}
      taxes={serializeTaxes(taxes)}
      prefilledTable={prefilledTable}
      customer={customer}
      activeSession={activeSession}
      verifiedPhone={verifiedPhone}
    />
  );
}
