import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listPartiesWithBalances } from "@/lib/services/party";
import { getShopById } from "@/lib/services/shop";
import { PartiesManager } from "@/components/admin/parties-manager";

export default async function PartiesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [parties, shop] = await Promise.all([
    listPartiesWithBalances(session.shopId),
    getShopById(session.shopId),
  ]);

  return <PartiesManager initialParties={parties} currency={shop.currency} />;
}
