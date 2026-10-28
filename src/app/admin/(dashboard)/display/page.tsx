import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listDisplaysForShop, toDisplayPayload } from "@/lib/services/display";
import { DisplayManagementClient } from "@/components/admin/display/display-management-client";

export default async function DisplayManagementPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const displays = await listDisplaysForShop(session.shopId);

  return (
    <DisplayManagementClient
      businessType={shop.businessType}
      initialDisplays={displays.map(toDisplayPayload)}
    />
  );
}
