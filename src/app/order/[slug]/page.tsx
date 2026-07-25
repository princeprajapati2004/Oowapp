import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { serializeProducts, serializeTaxes } from "@/lib/serialize";
import { getCustomerSession } from "@/lib/customer-session";
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

  // A customer session is scoped to one shop — confirm it matches this one
  // before treating the visitor as logged in here.
  let customer: { name: string; phone: string } | null = null;
  const session = await getCustomerSession();
  if (session) {
    const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });
    if (shopRow && shopRow.id === session.shopId) {
      customer = await db.customer.findUnique({
        where: { id: session.customerId },
        select: { name: true, phone: true },
      });
    }
  }

  return (
    <CustomerMenu
      shop={shopInfo}
      categories={categories}
      products={serializeProducts(products)}
      taxes={serializeTaxes(taxes)}
      prefilledTable={prefilledTable}
      customer={customer}
    />
  );
}
