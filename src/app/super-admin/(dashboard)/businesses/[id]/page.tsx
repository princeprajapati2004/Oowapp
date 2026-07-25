import { notFound } from "next/navigation";
import { getBusinessById } from "@/lib/services/business-management";
import { getSubscriptionDetailForSuperAdmin } from "@/lib/services/subscription-admin";
import { getFeaturePermissionsForBusiness } from "@/lib/services/feature-permission";
import { listPlans } from "@/lib/services/plan";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils/date";
import { BusinessActions } from "./business-actions";
import { SubscriptionManager } from "@/components/super-admin/subscription-manager";
import { FeaturePermissionsPanel } from "@/components/super-admin/feature-permissions-panel";

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

  const [subscriptionDetail, featurePermissions, plans] = await Promise.all([
    getSubscriptionDetailForSuperAdmin(id),
    getFeaturePermissionsForBusiness(id),
    listPlans(),
  ]);

  const currentForClient = {
    planCode: subscriptionDetail.current.planCode,
    planName: subscriptionDetail.current.planName,
    displayStatus: subscriptionDetail.current.displayStatus,
    duration: subscriptionDetail.current.duration,
    startDate: subscriptionDetail.current.startDate.toISOString(),
    endDate: subscriptionDetail.current.endDate ? subscriptionDetail.current.endDate.toISOString() : null,
    daysRemaining: subscriptionDetail.current.daysRemaining,
    createdBy: subscriptionDetail.current.createdBy,
    remarks: subscriptionDetail.current.remarks,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const historyForClient = subscriptionDetail.history.map((row: any) => ({
    ...row,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plansForClient = plans.map((plan: any) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    isActive: plan.isActive,
  }));

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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="permissions">Feature Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
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
        </TabsContent>

        <TabsContent value="subscription" className="pt-4">
          <SubscriptionManager
            shopId={business.id}
            current={currentForClient}
            history={historyForClient}
            plans={plansForClient}
          />
        </TabsContent>

        <TabsContent value="permissions" className="pt-4">
          <FeaturePermissionsPanel shopId={business.id} permissions={featurePermissions} />
        </TabsContent>
      </Tabs>
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
