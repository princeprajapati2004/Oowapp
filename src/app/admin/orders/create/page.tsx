import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateOrderPage } from "@/components/admin/create-order-page";

// Deliberately placed outside the (dashboard) route group — this is a
// full-screen, sidebar-free page (see CreateOrderPage), matching the same
// pattern already used by /admin/counter and /admin/kitchen.
export default async function CreateManualOrderPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  if (!shop.saveOrdersToDb) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={ClipboardList}
          title="Order history is off"
          description='Turn on "Save orders to database" in Settings to create manual orders.'
        />
      </div>
    );
  }

  return <CreateOrderPage currency={shop.currency} shopSlug={shop.slug} />;
}
