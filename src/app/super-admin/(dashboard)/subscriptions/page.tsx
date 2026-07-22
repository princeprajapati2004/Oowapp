import Image from "next/image";
import Link from "next/link";
import { Search, Building2 } from "lucide-react";
import { listBusinessSubscriptions } from "@/lib/services/subscription-admin";
import { listPlans } from "@/lib/services/plan";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/date";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS } from "@/lib/business-types";
import type { DisplayStatus } from "@/lib/services/subscription";

const STATUS_OPTIONS: { value: DisplayStatus; label: string }[] = [
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING_SOON", label: "Expiring Soon" },
  { value: "EXPIRED", label: "Expired" },
  { value: "SUSPENDED", label: "Suspended" },
];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  TRIAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  EXPIRING_SOON: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  EXPIRED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  TRIAL: "Trial",
  EXPIRING_SOON: "Expiring Soon",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

const ACCOUNT_STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  INACTIVE: "bg-muted text-muted-foreground",
  DELETED: "bg-muted text-muted-foreground line-through",
};

interface SearchParams {
  page?: string;
  search?: string;
  businessType?: string;
  status?: string;
  plan?: string;
  expiryBefore?: string;
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const search = sp.search || undefined;
  const businessType = sp.businessType || undefined;
  const status = (sp.status || undefined) as DisplayStatus | undefined;
  const planCode = sp.plan || undefined;
  const expiryBefore = sp.expiryBefore ? new Date(sp.expiryBefore) : undefined;

  const [{ rows, total, totalPages }, plans] = await Promise.all([
    listBusinessSubscriptions({
      search,
      businessType,
      status,
      planCode,
      expiryBefore,
      page,
      perPage: 20,
    }),
    listPlans(),
  ]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground text-sm">
          {total.toLocaleString()} business{total !== 1 ? "es" : ""} on the platform.
        </p>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search name, slug, or email…"
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          name="businessType"
          defaultValue={businessType ?? ""}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All business types</option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          name="plan"
          defaultValue={planCode ?? ""}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All plans</option>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(plans as any[]).map((plan) => (
            <option key={plan.id} value={plan.code}>
              {plan.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="expiryBefore"
          defaultValue={sp.expiryBefore ?? ""}
          title="Expiring before"
          className="rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">All Subscriptions</CardTitle>
          <CardDescription>
            Page {page} of {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Building2 className="size-8" />
              <p className="text-sm">No businesses match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left">Business</th>
                    <th className="px-4 py-3 text-left">Owner</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Contact</th>
                    <th className="px-4 py-3 text-left">Plan</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Start</th>
                    <th className="px-4 py-3 text-left">Expiry</th>
                    <th className="px-4 py-3 text-right">Days left</th>
                    <th className="px-4 py-3 text-left">Features</th>
                    <th className="px-4 py-3 text-left">Account</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(rows as any[]).map((row) => (
                    <tr key={row.shopId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {row.logoUrl ? (
                            <Image
                              src={row.logoUrl}
                              alt=""
                              width={28}
                              height={28}
                              className="size-7 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="size-7 shrink-0 rounded-md bg-muted" />
                          )}
                          <div>
                            <p className="font-medium truncate max-w-[160px]">{row.businessName}</p>
                            <p className="text-xs text-muted-foreground">/{row.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[140px]">
                        {row.ownerName || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {BUSINESS_TYPE_LABELS[row.businessType as keyof typeof BUSINESS_TYPE_LABELS] ?? row.businessType}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <p className="truncate max-w-[160px]">{row.email}</p>
                        {row.phone && <p className="text-xs">{row.phone}</p>}
                      </td>
                      <td className="px-4 py-3 font-medium">{row.planName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[row.status] ?? STATUS_STYLES.CANCELLED
                          }`}
                        >
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(row.startDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {row.endDate ? formatDate(row.endDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.daysRemaining === null ? "—" : Math.max(row.daysRemaining, 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {row.enabledFeatures.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            row.enabledFeatures.slice(0, 3).map((key: string) => (
                              <Badge key={key} variant="outline" className="text-[10px]">
                                {key}
                              </Badge>
                            ))
                          )}
                          {row.enabledFeatures.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{row.enabledFeatures.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            ACCOUNT_STATUS_STYLES[row.accountStatus] ?? ACCOUNT_STATUS_STYLES.INACTIVE
                          }`}
                        >
                          {row.accountStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/super-admin/businesses/${row.shopId}`}
                          className="text-xs font-medium text-primary underline underline-offset-4"
                        >
                          Manage
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && <PaginationLink page={page - 1} sp={sp}>Previous</PaginationLink>}
          <span className="text-sm text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          {page < totalPages && <PaginationLink page={page + 1} sp={sp}>Next</PaginationLink>}
        </div>
      )}
    </div>
  );
}

function PaginationLink({ page, sp, children }: { page: number; sp: SearchParams; children: React.ReactNode }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (sp.search) params.set("search", sp.search);
  if (sp.businessType) params.set("businessType", sp.businessType);
  if (sp.status) params.set("status", sp.status);
  if (sp.plan) params.set("plan", sp.plan);
  if (sp.expiryBefore) params.set("expiryBefore", sp.expiryBefore);

  return (
    <Link
      href={`/super-admin/subscriptions?${params.toString()}`}
      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
    >
      {children}
    </Link>
  );
}
