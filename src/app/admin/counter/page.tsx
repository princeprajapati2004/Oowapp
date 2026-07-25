import { redirect } from "next/navigation";
import { Banknote } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { toOrderEvent } from "@/lib/server/order-events";
import { EmptyState } from "@/components/shared/empty-state";
import { CashCounter } from "@/components/admin/cash-counter";

export default async function CounterPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  if (!shop.saveOrdersToDb) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={Banknote}
          title="Order history is off"
          description='Turn on "Save orders to database" in Settings to use the cash counter.'
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
      initialOrders={orders.map(toOrderEvent)}
      currency={shop.currency}
      shopName={shop.businessName}
    />
  );
}
