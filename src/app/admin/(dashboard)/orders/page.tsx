import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { searchOrders } from "@/lib/services/order-search";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OrdersListView } from "@/components/admin/orders/orders-list-view";

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

  const { orders, nextCursor, hasMore } = await searchOrders(session.shopId, { pageSize: 20 });
  const shopAny = shop as unknown as Record<string, unknown>;

  return (
    <OrdersListView
      initialOrders={orders}
      initialNextCursor={nextCursor}
      initialHasMore={hasMore}
      currency={shop.currency}
      shop={{
        slug: shop.slug,
        businessName: shop.businessName,
        logoUrl: shop.logoUrl,
        address: shop.address,
        phone: shop.phone,
        whatsappNumber: shop.whatsappNumber,
        gstNumber: shop.gstNumber,
        currency: shop.currency,
        upiId: shop.upiId,
        acceptCash: shop.acceptCash,
        bankAccountNumber: shop.bankAccountNumber,
        bankName: shop.bankName,
        bankIfsc: shop.bankIfsc,
        paymentQrImageUrl: shop.paymentQrImageUrl,
        paymentDisplayName: (shopAny.paymentDisplayName as string | null) ?? null,
        enableTableNumber: (shopAny.enableTableNumber as boolean) ?? true,
        enableOrderBarcodeLabels: (shopAny.enableOrderBarcodeLabels as boolean) ?? false,
      }}
    />
  );
}
