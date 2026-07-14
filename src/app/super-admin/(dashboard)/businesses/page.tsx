import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { PlatformAnalyticsService } from "@/lib/services/platform-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/date";

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const search = sp.search ?? undefined;
  const status = sp.status ?? undefined;

  const { shops, total, totalPages } = await PlatformAnalyticsService.getBusinessList({
    page,
    perPage: 20,
    search,
    status,
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
        <p className="text-muted-foreground text-sm">
          {total.toLocaleString()} business{total !== 1 ? "es" : ""} on the platform.
        </p>
      </div>

      {/* Search */}
      <form method="get" className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by name or slug…"
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">All Businesses</CardTitle>
          <CardDescription>
            Page {page} of {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {shops.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Building2 className="size-8" />
              <p className="text-sm">No businesses found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left">Business</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Admin</th>
                    <th className="px-4 py-3 text-right">Products</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-left">Plan</th>
                    <th className="px-4 py-3 text-left">Joined</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {shops.map((shop) => (
                    <tr key={shop.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[160px]">{shop.businessName}</p>
                        <p className="text-xs text-muted-foreground">/{shop.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {shop.businessType.charAt(0) + shop.businessType.slice(1).toLowerCase()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={shop.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">
                        {shop.admin.email}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {shop._count.products}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {shop._count.orders}
                      </td>
                      <td className="px-4 py-3">
                        <PlanBadge plan={shop.subscriptions[0]?.plan ?? "FREE"} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(shop.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/super-admin/businesses/${shop.id}`}
                          className="text-xs font-medium text-primary underline underline-offset-4"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <PaginationLink page={page - 1} search={search} status={status}>
              Previous
            </PaginationLink>
          )}
          <span className="text-sm text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <PaginationLink page={page + 1} search={search} status={status}>
              Next
            </PaginationLink>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    INACTIVE: "bg-muted text-muted-foreground",
    DELETED: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? map.INACTIVE}`}
    >
      {status}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    FREE: "text-muted-foreground",
    STARTER: "text-blue-600 dark:text-blue-400",
    PRO: "text-violet-600 dark:text-violet-400",
    ENTERPRISE: "text-amber-600 dark:text-amber-400",
  };
  return (
    <span className={`text-xs font-medium ${map[plan] ?? ""}`}>
      {plan}
    </span>
  );
}

function PaginationLink({
  page,
  search,
  status,
  children,
}: {
  page: number;
  search?: string;
  status?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  return (
    <Link
      href={`/super-admin/businesses?${params.toString()}`}
      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
    >
      {children}
    </Link>
  );
}
