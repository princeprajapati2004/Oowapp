import { redirect } from "next/navigation";
import Link from "next/link";
import { Banknote } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { toOrderEvent } from "@/lib/server/order-events";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { CashCounter } from "@/components/admin/cash-counter";

export default async function CounterPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

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

  const orders = await db.order.findMany({
    where: { shopId: session.shopId, status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] } },
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });

  return (
    <CashCounter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrders={(orders as any[]).map(toOrderEvent)}
      currency={shop.currency}
      shopName={shop.businessName}
    />
  );
}
