import { redirect } from "next/navigation";
import { ChefHat } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { toOrderEvent } from "@/lib/server/order-events";
import { EmptyState } from "@/components/shared/empty-state";
import { KitchenDisplay } from "@/components/admin/kitchen-display";

export default async function KitchenPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  if (!shop.saveOrdersToDb) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={ChefHat}
          title="Order history is off"
          description='Turn on "Save orders to database" in Settings to use the kitchen display.'
        />
      </div>
    );
  }

  const orders = await db.order.findMany({
    where: { shopId: session.shopId, status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } },
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });

  return <KitchenDisplay initialOrders={orders.map(toOrderEvent)} shopName={shop.businessName} />;
}
