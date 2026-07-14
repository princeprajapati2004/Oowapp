import { Building2, ShoppingCart, Package, AlertCircle } from "lucide-react";
import { PlatformAnalyticsService } from "@/lib/services/platform-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "@/lib/utils/date";

export default async function SuperAdminDashboardPage() {
  const [overview, recentSignups] = await Promise.all([
    PlatformAnalyticsService.getOverview(),
    PlatformAnalyticsService.getRecentSignups(8),
  ]);

  const stats = [
    {
      label: "Total Businesses",
      value: overview.totalBusinesses,
      icon: Building2,
    },
    {
      label: "Active Businesses",
      value: overview.activeBusinesses,
      icon: Building2,
    },
    {
      label: "Total Orders",
      value: overview.totalOrders,
      icon: ShoppingCart,
    },
    {
      label: "Total Products",
      value: overview.totalProducts,
      icon: Package,
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-muted-foreground text-sm">
          All businesses and activity across MyKharcha.
        </p>
      </div>

      {overview.suspendedBusinesses > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {overview.suspendedBusinesses} business
          {overview.suspendedBusinesses > 1 ? "es are" : " is"} currently suspended.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Icon className="size-3.5" />
                  {stat.label}
                </CardDescription>
                <CardTitle className="text-3xl">{stat.value.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Signups</CardTitle>
          <CardDescription>Latest businesses to join the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSignups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No signups yet.</p>
          ) : (
            <div className="divide-y">
              {recentSignups.map((admin) => (
                <div key={admin.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {admin.shop?.businessName ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusBadge status={admin.shop?.status ?? "ACTIVE"} />
                    <p className="text-xs text-muted-foreground mt-1">
                      {admin.shop?.createdAt
                        ? formatDistanceToNow(new Date(admin.shop.createdAt))
                        : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    INACTIVE: "bg-muted text-muted-foreground",
    DELETED: "bg-muted text-muted-foreground line-through",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? map.INACTIVE}`}
    >
      {status}
    </span>
  );
}
