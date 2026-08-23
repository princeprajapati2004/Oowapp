import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listCashbackCampaigns } from "@/lib/services/cashback-campaign";
import { getShopById } from "@/lib/services/shop";
import { serializeCashbackCampaigns } from "@/lib/serialize";
import { CashbackManager } from "@/components/admin/cashback-manager";

export default async function CashbackPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [campaigns, shop] = await Promise.all([
    listCashbackCampaigns(session.shopId),
    getShopById(session.shopId),
  ]);

  return (
    <CashbackManager initialCampaigns={serializeCashbackCampaigns(campaigns)} currency={shop.currency} />
  );
}
