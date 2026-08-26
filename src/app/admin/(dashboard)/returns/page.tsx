import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { searchReturns, getReturnSummary } from "@/lib/services/return-search";
import { ReturnsListView } from "@/components/admin/returns/returns-list-view";

export default async function ReturnsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const [{ returns, nextCursor, hasMore }, summary] = await Promise.all([
    searchReturns(session.shopId, { pageSize: 20 }),
    getReturnSummary(session.shopId),
  ]);

  return (
    <ReturnsListView
      initialReturns={returns}
      initialNextCursor={nextCursor}
      initialHasMore={hasMore}
      initialSummary={summary}
      currency={shop.currency}
    />
  );
}
