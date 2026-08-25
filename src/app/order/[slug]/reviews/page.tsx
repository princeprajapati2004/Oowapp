import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { getShopRatingSummary, listShopReviews } from "@/lib/services/review";
import { StoreReviews } from "@/components/customer/store-reviews";

export default async function StoreReviewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });
  if (!shopRow) notFound();

  const [summary, reviews] = await Promise.all([
    getShopRatingSummary(shopRow.id),
    listShopReviews(shopRow.id),
  ]);

  return <StoreReviews slug={slug} businessName={shop.businessName} summary={summary} reviews={reviews} />;
}
