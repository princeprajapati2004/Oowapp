import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { searchLossDamageRecords, getLossDamageSummary, toLossDamagePayload } from "@/lib/services/loss-damage";
import { LossDamageListView } from "@/components/admin/loss-damage/loss-damage-list-view";

export default async function LossDamagePage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const [{ records, nextCursor, hasMore }, summary] = await Promise.all([
    searchLossDamageRecords(session.shopId, { pageSize: 20 }),
    getLossDamageSummary(session.shopId),
  ]);

  return (
    <LossDamageListView
      initialRecords={records.map(toLossDamagePayload)}
      initialNextCursor={nextCursor}
      initialHasMore={hasMore}
      initialSummary={summary}
      currency={shop.currency}
    />
  );
}
