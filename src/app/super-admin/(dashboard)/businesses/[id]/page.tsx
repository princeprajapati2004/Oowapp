import { notFound } from "next/navigation";
import { getBusinessById } from "@/lib/services/business-management";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/date";
import { BusinessActions } from "./business-actions";

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let business;
  try {
    business = await getBusinessById(id);
  } catch {
    notFound();
  }

  const plan = business.subscriptions[0]?.plan ?? "FREE";
  const subStatus = business.subscriptions[0]?.status ?? "—";

  const info = [
    { label: "Business Name", value: business.businessName },
    { label: "Slug", value: `/${business.slug}` },
    { label: "Type", value: business.businessType },
    { label: "Owner Email", value: business.admin.email },
    { label: "WhatsApp", value: business.whatsappNumber || "—" },
    { label: "Phone", value: business.phone || "—" },
    { label: "Address", value: business.address || "—" },
    { label: "City", value: business.city || "—" },
    { label: "State", value: business.state || "—" },
    { label: "GST Number", value: business.gstNumber || "—" },
    { label: "Currency", value: business.currency },
    { label: "Published", value: business.isPublished ? "Yes" : "No" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{business.businessName}</h1>
          <p className="text-sm text-muted-foreground">
            Joined {formatDate(business.createdAt)} · Status: <StatusBadge status={business.status} />
          </p>
        </div>
        <BusinessActions
          businessId={business.id}
          currentStatus={business.status}
        />
      </div>

      {/* Suspension notice */}
      {business.status === "SUSPENDED" && business.suspendedReason && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Suspended</p>
          <p className="text-muted-foreground mt-0.5">{business.suspendedReason}</p>
          {business.suspendedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Since {formatDate(business.suspendedAt)}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stats</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Stat label="Products" value={business._count.products} />
            <Stat label="Categories" value={business._count.categories} />
            <Stat label="Orders" value={business._count.orders} />
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Plan" value={plan} />
            <Row label="Status" value={subStatus} />
            {business.subscriptions[0]?.startDate && (
              <Row label="Since" value={formatDate(business.subscriptions[0].startDate)} />
            )}
            {business.subscriptions[0]?.endDate && (
              <Row label="Expires" value={formatDate(business.subscriptions[0].endDate)} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Info</CardTitle>
          <CardDescription>Full details as provided by the business owner.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {info.map((item) => (
              <div key={item.label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground shrink-0">{item.label}</dt>
                <dd className="text-right break-all">{item.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            <Row label="Account created" value={formatDate(business.admin.createdAt)} />
            <Row label="Shop created" value={formatDate(business.createdAt)} />
            <Row
              label="Last login"
              value={business.lastLoginAt ? formatDate(business.lastLoginAt) : "Never"}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "text-emerald-600",
    SUSPENDED: "text-red-600",
    INACTIVE: "text-muted-foreground",
    DELETED: "text-muted-foreground line-through",
  };
  return (
    <span className={`font-medium ${map[status] ?? "text-muted-foreground"}`}>{status}</span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
