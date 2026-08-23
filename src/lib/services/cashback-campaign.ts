import { db } from "@/lib/db";
import { NotFoundError, ConflictError, InvalidCouponError } from "@/lib/api-utils";
import type { CashbackCampaignInput } from "@/lib/validation/cashback-campaign";
import type { ResolvedOrderItem } from "@/lib/services/order-items";
import type { CashbackCampaign, Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Admin CRUD — mirrors src/lib/services/coupon.ts's pattern exactly.
// ---------------------------------------------------------------------------

export async function listCashbackCampaigns(shopId: string) {
  return db.cashbackCampaign.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } });
}

async function assertOwnedCampaign(shopId: string, id: string) {
  const campaign = await db.cashbackCampaign.findFirst({ where: { id, shopId } });
  if (!campaign) throw new NotFoundError("Cashback campaign not found");
  return campaign;
}

function toCampaignData(input: CashbackCampaignInput) {
  return {
    code: normalizeCode(input.code),
    description: input.description || null,
    rewardType: input.rewardType,
    rewardValue: input.rewardValue,
    maxCashbackAmount: input.maxCashbackAmount ?? null,
    minOrderAmount: input.minOrderAmount ?? null,
    totalUsageLimit: input.totalUsageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit ?? null,
    startsAt: input.startsAt ?? null,
    expiresAt: input.expiresAt ?? null,
    isEnabled: input.isEnabled,
  };
}

export async function createCashbackCampaign(shopId: string, input: CashbackCampaignInput) {
  const existing = await db.cashbackCampaign.findUnique({
    where: { shopId_code: { shopId, code: normalizeCode(input.code) } },
  });
  if (existing) throw new ConflictError("A cashback campaign with this code already exists");

  return db.cashbackCampaign.create({ data: { shopId, ...toCampaignData(input) } });
}

export async function updateCashbackCampaign(shopId: string, id: string, input: CashbackCampaignInput) {
  await assertOwnedCampaign(shopId, id);

  const existing = await db.cashbackCampaign.findUnique({
    where: { shopId_code: { shopId, code: normalizeCode(input.code) } },
  });
  if (existing && existing.id !== id) throw new ConflictError("A cashback campaign with this code already exists");

  return db.cashbackCampaign.update({ where: { id }, data: toCampaignData(input) });
}

export async function deleteCashbackCampaign(shopId: string, id: string) {
  const campaign = await assertOwnedCampaign(shopId, id);
  // Used campaigns must be disabled, not deleted — deleting would cascade
  // away the CashbackRedemption audit trail behind orders that relied on it.
  if (campaign.usageCount > 0) {
    throw new ConflictError("This campaign has already been used and can't be deleted — disable it instead");
  }
  await db.cashbackCampaign.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Checkout-facing validation/redemption
// ---------------------------------------------------------------------------

/** Raw cashback amount for a campaign against a set of resolved order items. Pure — no DB writes. */
function computeCashback(campaign: CashbackCampaign, items: ResolvedOrderItem[]): number {
  const base = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let cashback =
    campaign.rewardType === "PERCENTAGE" ? (base * Number(campaign.rewardValue)) / 100 : Number(campaign.rewardValue);
  if (campaign.maxCashbackAmount != null) cashback = Math.min(cashback, Number(campaign.maxCashbackAmount));
  return round2(Math.max(0, cashback));
}

async function findEligibleCampaign(
  client: Tx | typeof db,
  shopId: string,
  code: string,
  subtotal: number
): Promise<CashbackCampaign> {
  const campaign = await client.cashbackCampaign.findFirst({
    where: { shopId, code: normalizeCode(code), isEnabled: true },
  });
  if (!campaign) throw new InvalidCouponError("Invalid cashback code");

  const now = new Date();
  if (campaign.startsAt && now < campaign.startsAt) throw new InvalidCouponError("This cashback code isn't active yet");
  if (campaign.expiresAt && now > campaign.expiresAt) throw new InvalidCouponError("This cashback code has expired");
  if (campaign.minOrderAmount != null && subtotal < Number(campaign.minOrderAmount)) {
    throw new InvalidCouponError(`Minimum order of ₹${Number(campaign.minOrderAmount)} required for this code`);
  }
  return campaign;
}

async function assertUnderPerCustomerLimit(
  client: Tx | typeof db,
  campaign: CashbackCampaign,
  customerId: string | null
) {
  if (campaign.perCustomerLimit == null) return;
  if (!customerId) throw new InvalidCouponError("Please log in to use this cashback code");
  const priorCount = await client.cashbackRedemption.count({ where: { campaignId: campaign.id, customerId } });
  if (priorCount >= campaign.perCustomerLimit) throw new InvalidCouponError("You've already used this cashback code");
}

/** Read-only preview for the customer-facing "Apply" button — never claims usage. Cashback always requires login. */
export async function previewCashback(
  shopId: string,
  code: string,
  items: ResolvedOrderItem[],
  customerId: string | null
): Promise<{ campaignId: string; code: string; cashbackAmount: number; description: string | null }> {
  if (!customerId) throw new InvalidCouponError("Please log in to use a cashback code");

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const campaign = await findEligibleCampaign(db, shopId, code, subtotal);

  if (campaign.totalUsageLimit != null && campaign.usageCount >= campaign.totalUsageLimit) {
    throw new InvalidCouponError("This cashback code has reached its usage limit");
  }
  await assertUnderPerCustomerLimit(db, campaign, customerId);

  const cashbackAmount = computeCashback(campaign, items);
  return { campaignId: campaign.id, code: campaign.code, cashbackAmount, description: campaign.description };
}

/**
 * Validates a cashback code and computes its reward, inside the
 * order-creation transaction, BEFORE the order exists — mirrors
 * computeCouponForOrder's split from the atomic claim below for the same
 * reason (CashbackRedemption.orderId is a required FK).
 */
export async function computeCashbackForOrder(
  tx: Tx,
  shopId: string,
  code: string,
  items: ResolvedOrderItem[],
  customerId: string | null
): Promise<{ campaignId: string; code: string; cashbackAmount: number }> {
  if (!customerId) throw new InvalidCouponError("Please log in to use a cashback code");

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const campaign = await findEligibleCampaign(tx, shopId, code, subtotal);

  if (campaign.totalUsageLimit != null && campaign.usageCount >= campaign.totalUsageLimit) {
    throw new InvalidCouponError("This cashback code has reached its usage limit");
  }
  await assertUnderPerCustomerLimit(tx, campaign, customerId);

  const cashbackAmount = computeCashback(campaign, items);
  return { campaignId: campaign.id, code: campaign.code, cashbackAmount };
}

/**
 * The atomic claim — call after tx.order.create, once a real orderId
 * exists. Creates a PENDING CashbackRedemption; the wallet isn't credited
 * yet (see rewards.ts#processOrderPaidRewards, fired once the order is
 * actually paid).
 */
export async function claimCashbackForOrder(
  tx: Tx,
  shopId: string,
  campaignId: string,
  customerId: string,
  orderId: string,
  cashbackAmount: number
): Promise<void> {
  const campaign = await tx.cashbackCampaign.findUniqueOrThrow({ where: { id: campaignId } });

  const claimed = await tx.cashbackCampaign.updateMany({
    where: {
      id: campaignId,
      ...(campaign.totalUsageLimit != null ? { usageCount: { lt: campaign.totalUsageLimit } } : {}),
    },
    data: { usageCount: { increment: 1 } },
  });
  if (claimed.count === 0) throw new InvalidCouponError("This cashback code has reached its usage limit");

  await tx.cashbackRedemption.create({
    data: { shopId, campaignId, orderId, customerId, cashbackAmount },
  });
}
