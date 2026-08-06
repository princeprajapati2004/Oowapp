import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { getDashboardAnalytics, type DashboardData } from "@/lib/services/analytics";
import { db } from "@/lib/db";
import { DashboardClient } from "@/components/admin/dashboard/dashboard-client";
import { LiveTableStats } from "@/components/admin/dashboard/live-table-stats";

const EMPTY_SUMMARY = {
  totalRevenue: 0,
  totalOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  avgOrderValue: 0,
  totalTax: 0,
  totalDiscount: 0,
};

const EMPTY_DASHBOARD_DATA: DashboardData = {
  summary: EMPTY_SUMMARY,
  prevSummary: EMPTY_SUMMARY,
  revenueChart: [],
  paymentBreakdown: [],
  statusBreakdown: [],
  topProducts: [],
  recentOrders: [],
  insights: [],
};

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // Settled independently: these three widgets are unrelated to each other
  // (revenue analytics, table occupancy, kitchen queue depth), so one flaky
  // query shouldn't take down the whole dashboard render — better to show
  // the two that succeeded than a full-page error boundary for a partial
  // blip. Failures are still logged server-side (picked up by
  // src/instrumentation.ts's onRequestError only for *thrown* errors, so we
  // log explicitly here since these are caught, not thrown).
  const [analyticsResult, sessionsResult, kitchenResult] = await Promise.allSettled([
    getDashboardAnalytics(session.shopId, todayStart, todayEnd, "hour"),
    db.tableSession.findMany({
      where: { shopId: session.shopId, status: { in: ["ACTIVE", "AWAITING_PAYMENT"] } },
      select: { status: true },
    }),
    db.order.count({ where: { shopId: session.shopId, status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } } }),
  ]);

  if (analyticsResult.status === "rejected") {
    console.error("[dashboard] analytics fetch failed", analyticsResult.reason);
  }
  if (sessionsResult.status === "rejected") {
    console.error("[dashboard] table sessions fetch failed", sessionsResult.reason);
  }
  if (kitchenResult.status === "rejected") {
    console.error("[dashboard] kitchen order count fetch failed", kitchenResult.reason);
  }

  const initialData = analyticsResult.status === "fulfilled" ? analyticsResult.value : EMPTY_DASHBOARD_DATA;
  const openSessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : [];
  const pendingKitchenOrders = kitchenResult.status === "fulfilled" ? kitchenResult.value : 0;

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
