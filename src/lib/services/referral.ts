import crypto from "crypto";
import { db } from "@/lib/db";
import { WalletError } from "@/lib/api-utils";
import type { ReferralConfigInput } from "@/lib/validation/referral";

function generateCode() {
  return "REF" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

/** Lazily generates this customer's referral code on first request — stable afterward. */
export async function getOrCreateReferralCode(shopId: string, customerId: string): Promise<string> {
  const customer = await db.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new WalletError("Account not found");
  if (customer.referralCode) return customer.referralCode;

  // Collisions are scoped per-shop (see @@unique([shopId, referralCode])) and
  // vanishingly unlikely at this code length — a few retries is plenty.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const updated = await db.customer.update({ where: { id: customerId }, data: { referralCode: code } });
      return updated.referralCode!;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique referral code — please try again");
}

export async function getReferralStats(shopId: string, customerId: string) {
  const code = await getOrCreateReferralCode(shopId, customerId);
  const referrals = await db.referral.findMany({
    where: { shopId, referrerCustomerId: customerId },
    include: { referredCustomer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totalEarned = referrals
    .filter((r) => r.status === "REWARDED")
    .reduce((sum, r) => sum + Number(r.rewardAmount ?? 0), 0);

  return { code, referrals, totalEarned };
}

export async function getReferralConfig(shopId: string) {
  return db.referralProgramConfig.findUnique({ where: { shopId } });
}

export async function upsertReferralConfig(shopId: string, input: ReferralConfigInput) {
  return db.referralProgramConfig.upsert({
    where: { shopId },
    create: { shopId, ...input },
    update: input,
  });
}

/** Admin visibility — every referral made in this shop, most recent first. */
export async function listReferrals(shopId: string) {
  return db.referral.findMany({
    where: { shopId },
    include: {
      referrerCustomer: { select: { name: true, phone: true, referralCode: true } },
      referredCustomer: { select: { name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
