import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { OrderHistory } from "@/components/customer/order-history";

export default async function OrderHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  return <OrderHistory slug={slug} businessName={shop.businessName} currency={shop.currency} />;
}
