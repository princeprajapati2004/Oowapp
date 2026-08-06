import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateOrderPage } from "@/components/admin/create-order-page";

const VALID_ORDER_TYPES = new Set(["DINE_IN", "TAKEAWAY", "DELIVERY"]);

// Deliberately placed outside the (dashboard) route group — this is a
// full-screen, sidebar-free page (see CreateOrderPage), matching the same
// pattern already used by /admin/counter and /admin/kitchen.
export default async function CreateManualOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; table?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const { type, table } = await searchParams;
  const initialOrderType = type && VALID_ORDER_TYPES.has(type) ? (type as "DINE_IN" | "TAKEAWAY" | "DELIVERY") : undefined;
  const initialTableNumber = table?.trim() || undefined;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;

  return (
    <CreateOrderPage
      currency={shop.currency}
      shopSlug={shop.slug}
      initialOrderType={initialTableNumber ? "DINE_IN" : initialOrderType}
      initialTableNumber={initialTableNumber}
      showProductImages={(shopAny.showProductImages as boolean) ?? true}
    />
  );
}
