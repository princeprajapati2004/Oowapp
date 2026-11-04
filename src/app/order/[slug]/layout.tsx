import { db } from "@/lib/db";
import { isAccountAccessBlocked } from "@/lib/services/subscription";
import { SubscriptionExpiredScreen } from "@/components/shared/subscription-expired-screen";

/**
 * Single choke point for the entire customer-facing ordering app under this
 * slug (menu, bill, orders, track, wallet, refer, reviews, login, signup) —
 * see subscription.ts::isAccountAccessBlocked. Shop-not-found/unpublished is
 * deliberately left to each page's own notFound() call (e.g. page.tsx's
 * getPublicShopBundle) rather than duplicated here — this layout only cares
 * about resolving adminId to run the gate.
 */
export default async function CustomerShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await db.shop.findUnique({ where: { slug }, select: { adminId: true } });
  if (!shop) return children;

  if (await isAccountAccessBlocked(shop.adminId)) {
    return <SubscriptionExpiredScreen variant="customer" />;
  }

  return children;
}
