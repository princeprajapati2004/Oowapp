import { redirect } from "next/navigation";
import { ChefHat } from "lucide-react";
import { getStaffSession } from "@/lib/staff-session";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { toOrderEvent } from "@/lib/server/order-events";
import { EmptyState } from "@/components/shared/empty-state";
import { KitchenDisplay } from "@/components/admin/kitchen-display";

export default async function KitchenStaffPage() {
  // Accept either a staff session (KITCHEN/MANAGER) or an admin session
  const staffSession = await getStaffSession();
  const adminSession = await getAdminSession();

  if (!staffSession && !adminSession) {
    redirect("/staff/login?redirect=/kitchen");
  }

  const shopId = staffSession?.shopId ?? adminSession!.shopId;

  if (staffSession && staffSession.role !== "KITCHEN" && staffSession.role !== "MANAGER") {
    redirect("/staff/login");
  }

  const shop = await getShopById(shopId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;

  if (!shop.saveOrdersToDb && shopAny.orderMode !== "DIRECT") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={ChefHat}
          title="Direct ordering is off"
          description='This restaurant has not enabled Direct Dashboard Ordering.'
        />
      </div>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [orders, completedToday] = await Promise.all([
    db.order.findMany({
      where: { shopId, status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] } },
      orderBy: { createdAt: "asc" },
      include: { items: true },
    }),
    db.order.findMany({
      where: { shopId, status: "COMPLETED", createdAt: { gte: startOfToday } },
      orderBy: { createdAt: "desc" },
      include: { items: true },
      take: 100,
    }),
  ]);

  return (
    <KitchenDisplay
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrders={(orders as any[]).map(toOrderEvent)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      completedToday={(completedToday as any[]).map(toOrderEvent)}
      shopName={shop.businessName}
    />
  );
}
