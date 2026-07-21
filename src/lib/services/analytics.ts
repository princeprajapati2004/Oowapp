import { db } from "@/lib/db";

export type Granularity = "hour" | "day" | "month";

export interface RevenuePoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface DashboardSummary {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  totalTax: number;
  totalDiscount: number;
}

export interface PaymentBreakdown {
  method: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface StatusBreakdown {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export interface RecentOrder {
  id: string;
  billNumber: string;
  customerName: string | null;
  grandTotal: number;
  paymentMethod: string | null;
  status: string;
  createdAt: string;
  source: string;
  itemCount: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  prevSummary: DashboardSummary;
  revenueChart: RevenuePoint[];
  paymentBreakdown: PaymentBreakdown[];
  statusBreakdown: StatusBreakdown[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
  insights: string[];
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  ONLINE: "Online",
  PENDING: "Pending",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function formatHourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function pct(current: number, prev: number): number | null {
  if (prev === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prev) / prev) * 100);
}

async function fetchSummary(shopId: string, from: Date, to: Date): Promise<DashboardSummary> {
  const where = { shopId, createdAt: { gte: from, lt: to } };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [agg, completed, cancelled] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.order as any).aggregate({
      where,
      _sum: { grandTotal: true, taxTotal: true, discountedTotal: true, discountValue: true },
      _count: true,
    }),
    db.order.count({ where: { ...where, status: "COMPLETED" } }),
    db.order.count({ where: { ...where, status: "CANCELLED" } }),
  ]);

  const totalRevenue = Number(agg._sum.grandTotal ?? 0);
  const totalOrders = agg._count;
  return {
    totalRevenue,
    totalOrders,
    completedOrders: completed,
    cancelledOrders: cancelled,
    avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    totalTax: Number(agg._sum.taxTotal ?? 0),
    totalDiscount: Number(agg._sum.discountValue ?? 0),
  };
}

async function fetchRevenueChart(shopId: string, from: Date, to: Date, granularity: Granularity): Promise<RevenuePoint[]> {
  if (granularity === "hour") {
    const rows = await db.$queryRaw<{ hour: number; revenue: number; orders: number }[]>`
      SELECT
        EXTRACT(HOUR FROM "createdAt")::int AS hour,
        COALESCE(SUM("grandTotal"::numeric)::float, 0) AS revenue,
        COUNT(*)::int AS orders
      FROM orders
      WHERE "shopId" = ${shopId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY hour
      ORDER BY hour
    `;
    const map = new Map(rows.map((r) => [r.hour, r]));
    return Array.from({ length: 24 }, (_, h) => ({
      label: formatHourLabel(h),
      revenue: map.get(h)?.revenue ?? 0,
      orders: map.get(h)?.orders ?? 0,
    }));
  }

  if (granularity === "day") {
    const rows = await db.$queryRaw<{ date: string; revenue: number; orders: number }[]>`
      SELECT
        TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM("grandTotal"::numeric)::float, 0) AS revenue,
        COUNT(*)::int AS orders
      FROM orders
      WHERE "shopId" = ${shopId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY date
      ORDER BY date
    `;
    const map = new Map(rows.map((r) => [r.date, r]));
    const points: RevenuePoint[] = [];
    const cursor = new Date(from);
    while (cursor < to) {
      const key = cursor.toISOString().slice(0, 10);
      const day = cursor.getDate();
      const month = cursor.toLocaleString("en", { month: "short" });
      points.push({
        label: `${month} ${day}`,
        revenue: map.get(key)?.revenue ?? 0,
        orders: map.get(key)?.orders ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }

  // month granularity
  const rows = await db.$queryRaw<{ month: string; revenue: number; orders: number }[]>`
    SELECT
      TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
      COALESCE(SUM("grandTotal"::numeric)::float, 0) AS revenue,
      COUNT(*)::int AS orders
    FROM orders
    WHERE "shopId" = ${shopId}
      AND "createdAt" >= ${from}
      AND "createdAt" < ${to}
    GROUP BY month
    ORDER BY month
  `;
  const map = new Map(rows.map((r) => [r.month, r]));
  const points: RevenuePoint[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth() + 1, 1);
  while (cursor < end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    points.push({
      label: cursor.toLocaleString("en", { month: "short" }),
      revenue: map.get(key)?.revenue ?? 0,
      orders: map.get(key)?.orders ?? 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

async function fetchPaymentBreakdown(shopId: string, from: Date, to: Date): Promise<PaymentBreakdown[]> {
  const rows = await db.$queryRaw<{ method: string | null; amount: number; count: number }[]>`
    SELECT
      "paymentMethod" AS method,
      COALESCE(SUM("grandTotal"::numeric)::float, 0) AS amount,
      COUNT(*)::int AS count
    FROM orders
    WHERE "shopId" = ${shopId}
      AND "createdAt" >= ${from}
      AND "createdAt" < ${to}
    GROUP BY "paymentMethod"
    ORDER BY amount DESC
  `;

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return rows.map((r) => ({
    method: r.method ?? "UNKNOWN",
    label: r.method ? (PAYMENT_LABELS[r.method] ?? r.method) : "QR/WhatsApp",
    amount: r.amount,
    count: r.count,
    percentage: total > 0 ? Math.round((r.amount / total) * 100) : 0,
  }));
}

async function fetchStatusBreakdown(shopId: string, from: Date, to: Date): Promise<StatusBreakdown[]> {
  const rows = await db.$queryRaw<{ status: string; count: number }[]>`
    SELECT
      status,
      COUNT(*)::int AS count
    FROM orders
    WHERE "shopId" = ${shopId}
      AND "createdAt" >= ${from}
      AND "createdAt" < ${to}
    GROUP BY status
    ORDER BY count DESC
  `;
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return rows.map((r) => ({
    status: r.status,
    label: STATUS_LABELS[r.status] ?? r.status,
    count: r.count,
    percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
  }));
}

async function fetchTopProducts(shopId: string, from: Date, to: Date, limit = 5): Promise<TopProduct[]> {
  return db.$queryRaw<TopProduct[]>`
    SELECT
      oi.name,
      SUM(oi.quantity)::int AS quantity,
      COALESCE(SUM(oi."lineTotal"::numeric)::float, 0) AS revenue
    FROM order_items oi
    JOIN orders o ON oi."orderId" = o.id
    WHERE o."shopId" = ${shopId}
      AND o."createdAt" >= ${from}
      AND o."createdAt" < ${to}
    GROUP BY oi.name
    ORDER BY quantity DESC
    LIMIT ${limit}
  `;
}

async function fetchRecentOrders(shopId: string, limit = 5): Promise<RecentOrder[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = await (db.order as any).findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      billNumber: true,
      customerName: true,
      grandTotal: true,
      paymentMethod: true,
      status: true,
      createdAt: true,
      source: true,
      items: { select: { id: true } },
    },
  });
  return orders.map((o: {
    id: string;
    billNumber: string;
    customerName: string | null;
    grandTotal: unknown;
    paymentMethod: string | null;
    status: string;
    createdAt: Date;
    source: string;
    items: { id: string }[];
  }) => ({
    id: o.id,
    billNumber: o.billNumber,
    customerName: o.customerName,
    grandTotal: Number(o.grandTotal),
    paymentMethod: o.paymentMethod,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    source: o.source ?? "qr",
    itemCount: o.items.length,
  }));
}

function generateInsights(
  summary: DashboardSummary,
  prevSummary: DashboardSummary,
  payment: PaymentBreakdown[],
  topProducts: TopProduct[],
  chart: RevenuePoint[]
): string[] {
  const insights: string[] = [];

  const revChange = pct(summary.totalRevenue, prevSummary.totalRevenue);
  if (revChange !== null && Math.abs(revChange) >= 5) {
    insights.push(
      revChange > 0
        ? `Revenue is up ${revChange}% compared to the previous period.`
        : `Revenue dropped ${Math.abs(revChange)}% compared to the previous period.`
    );
  }

  const topPayment = payment[0];
  if (topPayment && topPayment.percentage >= 40) {
    insights.push(`${topPayment.label} accounts for ${topPayment.percentage}% of your revenue.`);
  }

  if (topProducts.length > 0) {
    const best = topProducts[0];
    insights.push(`${best.name} is your top seller with ${best.quantity} units sold.`);
  }

  const peakHour = chart.reduce((best, point, idx) => {
    return point.revenue > (chart[best]?.revenue ?? 0) ? idx : best;
  }, 0);
  if (chart[peakHour]?.revenue > 0 && chart.length === 24) {
    insights.push(`Peak sales today are around ${chart[peakHour].label}.`);
  }

  const completionRate =
    summary.totalOrders > 0
      ? Math.round((summary.completedOrders / summary.totalOrders) * 100)
      : 0;
  if (completionRate > 0) {
    insights.push(`${completionRate}% of orders are completed successfully.`);
  }

  return insights.slice(0, 4);
}

export async function getDashboardAnalytics(
  shopId: string,
  from: Date,
  to: Date,
  granularity: Granularity
): Promise<DashboardData> {
  // Previous period of the same length
  const periodMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - periodMs);
  const prevTo = new Date(from.getTime());

  const [summary, prevSummary, revenueChart, paymentBreakdown, statusBreakdown, topProducts, recentOrders] =
    await Promise.all([
      fetchSummary(shopId, from, to),
      fetchSummary(shopId, prevFrom, prevTo),
      fetchRevenueChart(shopId, from, to, granularity),
      fetchPaymentBreakdown(shopId, from, to),
      fetchStatusBreakdown(shopId, from, to),
      fetchTopProducts(shopId, from, to),
      fetchRecentOrders(shopId),
    ]);

  const insights = generateInsights(summary, prevSummary, paymentBreakdown, topProducts, revenueChart);

  return { summary, prevSummary, revenueChart, paymentBreakdown, statusBreakdown, topProducts, recentOrders, insights };
}
