import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { searchOrders } from "@/lib/services/order-search";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OrdersListView } from "@/components/admin/orders/orders-list-view";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const { search } = await searchParams;

  const shop = await getShopById(session.shopId);

  if (!shop.saveOrdersToDb) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <EmptyState
          icon={ClipboardList}
          title="Order history is off"
          description='Turn on "Save orders to database" in Settings — orders always reach you on WhatsApp either way.'
          action={
            <Button render={<Link href="/admin/settings" />}>
              Go to Settings
            </Button>
          }
        />
      </div>
    );
  }

  const { orders, nextCursor, hasMore } = await searchOrders(session.shopId, { search, pageSize: 20 });

  return (
    <OrdersListView
      initialOrders={orders}
      initialNextCursor={nextCursor}
      initialHasMore={hasMore}
      initialSearch={search ?? ""}
      currency={shop.currency}
    />
  );
}
