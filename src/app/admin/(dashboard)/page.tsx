import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { getSubscriptionSummaryForBusiness } from "@/lib/services/subscription";
import { getDashboardAnalytics } from "@/lib/services/analytics";
import { DashboardClient } from "@/components/admin/dashboard/dashboard-client";
import { SubscriptionCard } from "@/components/admin/subscription-card";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [shop, subscription] = await Promise.all([
    getShopById(session.shopId),
    getSubscriptionSummaryForBusiness(session.shopId),
  ]);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const initialData = await getDashboardAnalytics(session.shopId, todayStart, todayEnd, "hour");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as unknown as Record<string, unknown>;

  return (
    <div className="space-y-5">
      <SubscriptionCard subscription={subscription} />
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
