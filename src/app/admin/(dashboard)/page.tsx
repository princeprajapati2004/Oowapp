import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { getDashboardAnalytics } from "@/lib/services/analytics";
import { DashboardClient } from "@/components/admin/dashboard/dashboard-client";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  // Load today's data for initial render
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const initialData = await getDashboardAnalytics(session.shopId, todayStart, todayEnd, "hour");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as unknown as Record<string, unknown>;

  return (
    <DashboardClient
      initialData={initialData}
      initialGranularity="hour"
      currency={shop.currency}
      shopName={shop.businessName}
      shopSlug={shop.slug}
      ownerName={(shopAny.ownerName as string | null) ?? null}
    />
  );
}
