import { redirect } from "next/navigation";
import Link from "next/link";
import { Banknote } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getStaffSession } from "@/lib/staff-session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { toAdminOrderEvent } from "@/lib/server/order-events";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { CashCounter } from "@/components/admin/cash-counter";

// Everything from a new order up through Delivered is still actionable here
// (payment can be recorded at any point, and Mark Complete becomes available
// once the fulfillment flow reaches its last pre-completion step — see
// getNextStatus() in order-status.ts, which differs for delivery vs
// dine-in/takeaway orders). CANCELLED is deliberately excluded — cancelled
// orders belong in Order History, not an actionable counter queue.
const ACTIVE_COUNTER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

const ORDER_INCLUDE = {
  items: true,
  statusEvents: { orderBy: { changedAt: "asc" as const } },
  paymentRecords: { orderBy: { createdAt: "asc" as const } },
};

export default async function CounterPage() {
  // Accept either the owner's own admin session or a WAITER/MANAGER staff
  // login — same dual-session pattern already used by /kitchen for KITCHEN
  // staff.
  const staffSession = await getStaffSession();
  const adminSession = await getAdminSession();
  if (!staffSession && !adminSession) redirect("/login");
  if (staffSession && staffSession.role !== "WAITER" && staffSession.role !== "MANAGER") {
    redirect("/staff/login");
  }

  const shopId = staffSession?.shopId ?? adminSession!.shopId;
  const shop = await getShopById(shopId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;
  if (!shop.saveOrdersToDb && shopAny.orderMode !== "DIRECT") {
    return (
      <div className="flex h-[60vh] items-center justify-center px-4">
        <EmptyState
          icon={Banknote}
          title="Order history is off"
          description='Enable "Direct Dashboard Ordering" or turn on "Save orders to database" in Settings to use the cash counter.'
          action={
            <Button render={<Link href="/admin/settings" />}>
              Go to Settings
            </Button>
          }
        />
      </div>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [orders, completedToday] = await Promise.all([
    db.order.findMany({
      where: { shopId, status: { in: [...ACTIVE_COUNTER_STATUSES] } },
      orderBy: { createdAt: "asc" },
      include: ORDER_INCLUDE,
    }),
    db.order.findMany({
      where: { shopId, status: "COMPLETED", createdAt: { gte: startOfToday } },
      orderBy: { createdAt: "desc" },
      include: ORDER_INCLUDE,
      take: 100,
    }),
  ]);

  return (
    <CashCounter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrders={(orders as any[]).map(toAdminOrderEvent)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      completedToday={(completedToday as any[]).map(toAdminOrderEvent)}
      currency={shop.currency}
      shopName={shop.businessName}
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
        printFormat: shop.printFormat,
      }}
    />
  );
}
