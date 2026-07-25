import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { getCustomerSession } from "@/lib/customer-session";
import { db } from "@/lib/db";
import { OrderHistory } from "@/components/customer/order-history";

export default async function OrderHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  let isLoggedIn = false;
  const session = await getCustomerSession();
  if (session) {
    const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });
    isLoggedIn = !!shopRow && shopRow.id === session.shopId;
  }

  return (
    <OrderHistory slug={slug} businessName={shop.businessName} currency={shop.currency} isLoggedIn={isLoggedIn} />
  );
}
