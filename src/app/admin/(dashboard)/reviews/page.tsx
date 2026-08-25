import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listOwnerReviews, getShopRatingSummary } from "@/lib/services/review";
import { ReviewsManager } from "@/components/admin/reviews-manager";

export default async function AdminReviewsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [reviews, summary] = await Promise.all([
    listOwnerReviews(session.shopId),
    getShopRatingSummary(session.shopId),
  ]);

  return <ReviewsManager initialReviews={reviews} summary={summary} />;
}
