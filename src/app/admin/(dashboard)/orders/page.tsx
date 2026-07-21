import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { serializeOrders } from "@/lib/serialize";
import { EmptyState } from "@/components/shared/empty-state";
import { OrdersManager } from "@/components/admin/orders-manager";

export default async function OrdersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  if (!shop.saveOrdersToDb) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <EmptyState
          icon={ClipboardList}
          title="Order history is off"
          description={
            'Turn on "Save orders to database" in Settings to start logging orders here. Orders always reach you on WhatsApp either way.'
          }
        />
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = await (db.order as any).findMany({
    where: { shopId: session.shopId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: true },
  });
  const serialized = serializeOrders(orders);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <OrdersManager initialOrders={serialized as any} currency={shop.currency} shopSlug={shop.slug} />
  );
}
