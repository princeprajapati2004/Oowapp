import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getReferralConfig, listReferrals } from "@/lib/services/referral";
import { getShopById } from "@/lib/services/shop";
import { ReferralManager } from "@/components/admin/referral-manager";

export default async function ReferralsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [config, referrals, shop] = await Promise.all([
    getReferralConfig(session.shopId),
    listReferrals(session.shopId),
    getShopById(session.shopId),
  ]);

  return (
    <ReferralManager
      initialConfig={
        config
          ? {
              isEnabled: config.isEnabled,
              rewardAmount: Number(config.rewardAmount),
              minQualifyingOrderAmount: config.minQualifyingOrderAmount == null ? null : Number(config.minQualifyingOrderAmount),
              qualifyingOrderScope: config.qualifyingOrderScope as "FIRST_ORDER" | "ANY_ORDER",
            }
          : null
      }
      initialReferrals={referrals.map((r) => ({
        id: r.id,
        referrerName: r.referrerCustomer.name,
        referrerPhone: r.referrerCustomer.phone,
        referrerCode: r.referrerCustomer.referralCode,
        referredName: r.referredCustomer.name,
        referredPhone: r.referredCustomer.phone,
        status: r.status,
        rewardAmount: r.rewardAmount == null ? null : Number(r.rewardAmount),
        createdAt: r.createdAt.toISOString(),
        rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
        qualifyingOrderId: r.qualifyingOrderId,
      }))}
      currency={shop.currency}
    />
  );
}
