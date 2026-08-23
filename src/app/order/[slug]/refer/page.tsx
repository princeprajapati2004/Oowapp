import { notFound, redirect } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { getCustomerSession } from "@/lib/customer-session";
import { getReferralStats, getReferralConfig } from "@/lib/services/referral";
import { db } from "@/lib/db";
import { ReferPage } from "@/components/customer/refer-page";

export default async function CustomerReferPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });
  const session = await getCustomerSession();
  // No guest referral code — send them to log in, matching the wallet page.
  if (!shopRow || !session || session.shopId !== shopRow.id) {
    redirect(`/order/${slug}/login`);
  }

  const [{ code, referrals, totalEarned }, config] = await Promise.all([
    getReferralStats(shopRow.id, session.customerId),
    getReferralConfig(shopRow.id),
  ]);

  return (
    <ReferPage
      slug={slug}
      businessName={shop.businessName}
      currency={shop.currency}
      code={code}
      totalEarned={totalEarned}
      programEnabled={!!config?.isEnabled}
      rewardAmount={config ? Number(config.rewardAmount) : 0}
      referrals={referrals.map((r) => ({
        id: r.id,
        referredName: r.referredCustomer.name,
        status: r.status,
        rewardAmount: r.rewardAmount == null ? null : Number(r.rewardAmount),
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
