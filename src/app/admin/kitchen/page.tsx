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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;
  if (!shop.saveOrdersToDb && shopAny.orderMode !== "DIRECT") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={ChefHat}
          title="Order history is off"
          description='Enable "Direct Dashboard Ordering" or turn on "Save orders to database" in Settings to use the kitchen display.'
        />
      </div>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [orders, completedToday, activeKots] = await Promise.all([
    db.order.findMany({
      where: { shopId: session.shopId, status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] } },
      orderBy: { createdAt: "asc" },
      include: { items: true },
    }),
    db.order.findMany({
      where: { shopId: session.shopId, status: "COMPLETED", createdAt: { gte: startOfToday } },
      orderBy: { createdAt: "desc" },
      include: { items: true },
      take: 100,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).kitchenTicket.findMany({
      where: { shopId: session.shopId, status: { in: ["PENDING", "PREPARING", "READY"] } },
      include: {
        items: true,
        tableSession: { select: { tableNumber: true, customerName: true } },
        staff: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serializedKots = (activeKots as any[]).map((kt: any) => ({
    id: kt.id,
    shopId: kt.shopId,
    tableSessionId: kt.tableSessionId,
    kotNumber: kt.kotNumber,
    status: kt.status,
    notes: kt.notes,
    createdAt: kt.createdAt.toISOString(),
    tableSession: { tableNumber: kt.tableSession.tableNumber, customerName: kt.tableSession.customerName },
    staffName: kt.staff?.name ?? null,
    items: kt.items.map((i) => ({
      id: i.id,
      name: i.name,
      price: Number(i.price),
      quantity: i.quantity,
      notes: i.notes,
    })),
  }));

  return (
    <KitchenDisplay
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrders={(orders as any[]).map(toOrderEvent)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      completedToday={(completedToday as any[]).map(toOrderEvent)}
      initialKots={serializedKots}
      shopName={shop.businessName}
    />
  );
}
