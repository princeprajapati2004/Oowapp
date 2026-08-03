import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { getDashboardAnalytics } from "@/lib/services/analytics";
import { db } from "@/lib/db";
import { DashboardClient } from "@/components/admin/dashboard/dashboard-client";
import { LiveTableStats } from "@/components/admin/dashboard/live-table-stats";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const [initialData, openSessions, pendingKitchenOrders] = await Promise.all([
    getDashboardAnalytics(session.shopId, todayStart, todayEnd, "hour"),
    db.tableSession.findMany({
      where: { shopId: session.shopId, status: { in: ["ACTIVE", "AWAITING_PAYMENT"] } },
      select: { status: true },
    }),
    db.order.count({ where: { shopId: session.shopId, status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } } }),
  ]);

  const shopAny = shop as unknown as Record<string, unknown>;
  const configuredTables: string[] = shop.tableNames ? JSON.parse(shop.tableNames) : [];
  const occupied = openSessions.filter((s) => s.status === "ACTIVE").length;
  const awaitingPayment = openSessions.filter((s) => s.status === "AWAITING_PAYMENT").length;
  const available = Math.max(0, configuredTables.length - openSessions.length);

  return (
    <div className="space-y-5">
      {configuredTables.length > 0 && (
        <LiveTableStats
          available={available}
          occupied={occupied}
          awaitingPayment={awaitingPayment}
          pendingKitchenOrders={pendingKitchenOrders}
        />
      )}
      <DashboardClient
        initialData={initialData}
        initialGranularity="hour"
        currency={shop.currency}
        shopName={shop.businessName}
        shopSlug={shop.slug}
        ownerName={(shopAny.ownerName as string | null) ?? null}
      />
    </div>
  );
}
