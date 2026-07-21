"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp, TrendingDown, Minus, ShoppingBag, CircleDollarSign,
  BarChart3, Clock, Sparkles, QrCode, Settings, Plus, ClipboardList,
  UtensilsCrossed, ChevronRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RevenueChart } from "./revenue-chart";
import { CreateOrderDialog } from "@/components/admin/create-order-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { api } from "@/lib/api-client";
import type { DashboardData, RevenuePoint } from "@/lib/services/analytics";
import { cn } from "@/lib/utils";

type Period = "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "12m";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "12m", label: "12 Months" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  READY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const PAYMENT_COLORS: Record<string, string> = {
  UPI: "bg-purple-500",
  CASH: "bg-emerald-500",
  CARD: "bg-blue-500",
  ONLINE: "bg-cyan-500",
  PENDING: "bg-amber-500",
  UNKNOWN: "bg-muted-foreground",
};

function getPaymentColor(method: string) {
  return PAYMENT_COLORS[method] ?? "bg-gray-400";
}

function getGreeting(ownerName: string | null, businessName: string): string {
  const hour = new Date().getHours();
  const prefix = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${prefix}, ${ownerName ?? businessName}`;
}

function ChangePill({ change }: { change: number | null }) {
  if (change === null) return null;
  const positive = change >= 0;
  const Icon = change === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
      )}
    >
      <Icon className="size-3" />
      {Math.abs(change)}%
    </span>
  );
}

function pct(a: number, b: number): number | null {
  if (b === 0) return a > 0 ? 100 : null;
  return Math.round(((a - b) / b) * 100);
}

interface Props {
  initialData: DashboardData;
  initialGranularity: "hour" | "day" | "month";
  currency: string;
  shopName: string;
  shopSlug: string;
  ownerName: string | null;
}

export function DashboardClient({ initialData, initialGranularity, currency, shopName, shopSlug, ownerName }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<DashboardData>(initialData);
  const [granularity, setGranularity] = useState<"hour" | "day" | "month">(initialGranularity);
  const [isPending, startTransition] = useTransition();
  const [selectedPoint, setSelectedPoint] = useState<{ point: RevenuePoint; index: number } | null>(null);

  const changePeriod = useCallback((p: Period) => {
    setPeriod(p);
    setSelectedPoint(null);
    startTransition(async () => {
      try {
        const res = await api.get<DashboardData & { granularity: "hour" | "day" | "month" }>(
          `/api/admin/analytics?period=${p}`
        );
        setData(res);
        setGranularity(res.granularity);
      } catch {
        toast.error("Failed to load analytics");
      }
    });
  }, []);

  const { summary, prevSummary, revenueChart, paymentBreakdown, statusBreakdown, topProducts, recentOrders, insights } = data;

  const revenueChange = pct(summary.totalRevenue, prevSummary.totalRevenue);
  const ordersChange = pct(summary.totalOrders, prevSummary.totalOrders);
  const avgChange = pct(summary.avgOrderValue, prevSummary.avgOrderValue);
  const completionRate = summary.totalOrders > 0
    ? Math.round((summary.completedOrders / summary.totalOrders) * 100)
    : 0;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{getGreeting(ownerName, shopName)}</h1>
          {summary.totalOrders > 0 ? (
            <p className="text-sm text-muted-foreground mt-0.5">
              {period === "today" ? "Today your business earned " : "This period you earned "}
              <span className="font-semibold text-foreground">{formatCurrency(summary.totalRevenue, currency)}</span>
              {" · "}
              <span className="font-semibold text-foreground">{summary.totalOrders}</span> orders
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">No orders yet in this period.</p>
          )}
        </div>
        <CreateOrderDialog currency={currency} shopSlug={shopSlug} onCreated={() => router.refresh()} />
      </div>

      {/* Period Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => changePeriod(p.value)}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-2xl font-bold tabular-nums tracking-tight">
                {isPending ? (
                  <Skeleton className="h-7 w-28" />
                ) : (
                  formatCurrency(
                    selectedPoint ? selectedPoint.point.revenue : summary.totalRevenue,
                    currency
                  )
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {selectedPoint ? selectedPoint.point.label : "Total Revenue"}
                </span>
                {!selectedPoint && <ChangePill change={revenueChange} />}
                {selectedPoint && (
                  <button
                    onClick={() => setSelectedPoint(null)}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {selectedPoint && (
              <div className="text-right text-sm">
                <div className="font-semibold">{selectedPoint.point.orders} orders</div>
                <div className="text-xs text-muted-foreground">
                  {selectedPoint.point.orders > 0
                    ? formatCurrency(selectedPoint.point.revenue / selectedPoint.point.orders, currency) + " avg"
                    : "—"}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <RevenueChart
              data={revenueChart}
              granularity={granularity}
              currency={currency}
              selectedIndex={selectedPoint?.index}
              onPointClick={(point, index) =>
                setSelectedPoint((prev) => (prev?.index === index ? null : { point, index }))
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Orders",
            value: summary.totalOrders,
            change: ordersChange,
            icon: ShoppingBag,
            display: summary.totalOrders.toString(),
          },
          {
            label: "Avg Order",
            value: summary.avgOrderValue,
            change: avgChange,
            icon: CircleDollarSign,
            display: formatCurrency(summary.avgOrderValue, currency),
          },
          {
            label: "Completed",
            value: completionRate,
            change: null,
            icon: BarChart3,
            display: `${completionRate}%`,
          },
          {
            label: "Tax Collected",
            value: summary.totalTax,
            change: null,
            icon: Clock,
            display: formatCurrency(summary.totalTax, currency),
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-start justify-between">
                <span className="text-xs text-muted-foreground">{card.label}</span>
                <card.icon className="size-4 text-muted-foreground/60" />
              </div>
              {isPending ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <div className="text-xl font-bold tabular-nums tracking-tight">{card.display}</div>
              )}
              {card.change !== null && !isPending && <ChangePill change={card.change} />}
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Payment + Status Row */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Payment Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : paymentBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment data for this period.</p>
            ) : (
              paymentBreakdown.map((p) => (
                <div key={p.method} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(p.amount, currency)} · {p.percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", getPaymentColor(p.method))}
                      style={{ width: `${p.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Order Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Order Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isPending ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-20" />)}
              </div>
            ) : statusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statusBreakdown.map((s) => (
                  <div
                    key={s.status}
                    className={cn("inline-flex flex-col items-center rounded-lg px-3 py-2 text-xs font-medium", STATUS_COLORS[s.status] ?? "bg-muted text-muted-foreground")}
                  >
                    <span className="text-lg font-bold tabular-nums leading-tight">{s.count}</span>
                    <span className="opacity-80">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products + Recent Orders */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Top Products */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Top Selling Products</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales data yet.</p>
            ) : (
              topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-medium text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.quantity} sold</div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(p.revenue, currency)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href="/admin/orders" />}>
              View all <ChevronRight className="size-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent orders.</p>
            ) : (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-muted-foreground">{order.billNumber}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1 py-0 h-4", order.source === "manual" ? "border-blue-300 text-blue-600" : "border-muted-foreground/30 text-muted-foreground")}
                      >
                        {order.source === "manual" ? "Manual" : "QR"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {order.customerName ?? "Walk-in"}{order.paymentMethod ? ` · ${order.paymentMethod}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{formatCurrency(order.grandTotal, currency)}</div>
                    <span className={cn("text-[10px] px-1.5 rounded-full", STATUS_COLORS[order.status] ?? "bg-muted text-muted-foreground")}>
                      {order.status}
                    </span>
                  </div>
                  <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights + Quick Actions */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Business Insights */}
        {insights.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-amber-500" />
                Business Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {insights.map((insight, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                  {insight}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 grid grid-cols-2 gap-2">
            {[
              { href: "/admin/products", label: "Add Product", icon: UtensilsCrossed },
              { href: "/admin/orders", label: "View Orders", icon: ClipboardList },
              { href: "/admin/qr", label: "Get QR Code", icon: QrCode },
              { href: "/admin/settings", label: "Settings", icon: Settings },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <action.icon className="size-4 text-muted-foreground" />
                {action.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
