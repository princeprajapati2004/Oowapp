import { creditWallet } from "@/lib/services/wallet";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Fires once an order is actually paid — called from both the standalone
 * mark_paid action (admin/orders/[id]/route.ts) and closeTable()
 * (admin/table-sessions/[id]/route.ts, the primary path for QR/dine-in
 * orders). Ties reward-crediting to real money changing hands rather than
 * order-confirmed, matching the coupon/wallet system's existing anti-abuse
 * posture. Idempotent — creditWallet's (orderId, type) uniqueness means a
 * retried call (e.g. two independent code paths both marking the same order
 * paid) is a safe no-op, never a double credit.
 */
export async function processOrderPaidRewards(
  tx: Tx,
  order: { id: string; shopId: string; customerId: string | null; cashbackCode?: string | null }
): Promise<void> {
  // Guest orders never carry a pending cashback/referral — both require login.
  if (!order.customerId) return;

  const redemption = await tx.cashbackRedemption.findUnique({ where: { orderId: order.id } });
  if (redemption && redemption.status === "PENDING") {
    const claimed = await tx.cashbackRedemption.updateMany({
      where: { id: redemption.id, status: "PENDING" },
      data: { status: "CREDITED", creditedAt: new Date() },
    });
    if (claimed.count > 0) {
      await creditWallet(tx, {
        shopId: order.shopId,
        customerId: order.customerId,
        type: "CASHBACK_CREDIT",
        amount: Number(redemption.cashbackAmount),
        orderId: order.id,
        description: order.cashbackCode ? `Cashback — ${order.cashbackCode}` : "Cashback credited",
      });
    }
  }

  // Referral branch added in Phase 4.
}

/** Cancelling an order before it's paid must not leave a pending cashback rotting forever. */
export async function voidPendingCashbackRedemption(tx: Tx, orderId: string): Promise<void> {
  await tx.cashbackRedemption.updateMany({
    where: { orderId, status: "PENDING" },
    data: { status: "VOIDED" },
  });
}
