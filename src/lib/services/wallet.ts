import { db } from "@/lib/db";
import { WalletError } from "@/lib/api-utils";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Balance + recent ledger for the customer-facing wallet page. */
export async function getWalletSummary(shopId: string, customerId: string) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: { walletBalance: true },
  });
  if (!customer) throw new WalletError("Account not found");

  const transactions = await db.walletTransaction.findMany({
    where: { shopId, customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { balance: Number(customer.walletBalance), transactions };
}

/**
 * Credits a customer's wallet — always inside the caller's transaction, and
 * always idempotent per (orderId, type) via the DB unique constraint (a
 * retried trigger is a no-op, not a double credit). orderId is null for
 * manual admin adjustments, which aren't order-triggered and don't need
 * this protection.
 */
export async function creditWallet(
  tx: Tx,
  args: {
    shopId: string;
    customerId: string;
    type: "CASHBACK_CREDIT" | "REFERRAL_CREDIT" | "ADMIN_ADJUSTMENT" | "REFUND_CREDIT";
    amount: number;
    orderId?: string | null;
    description?: string | null;
  }
): Promise<{ credited: boolean; transactionId: string }> {
  if (args.orderId) {
    const existing = await tx.walletTransaction.findUnique({
      where: { orderId_type: { orderId: args.orderId, type: args.type } },
    });
    if (existing) return { credited: false, transactionId: existing.id };
  }

  const updated = await tx.customer.update({
    where: { id: args.customerId },
    data: { walletBalance: { increment: args.amount } },
  });

  const transaction = await tx.walletTransaction.create({
    data: {
      shopId: args.shopId,
      customerId: args.customerId,
      type: args.type,
      amount: args.amount,
      balanceAfter: updated.walletBalance,
      orderId: args.orderId ?? null,
      description: args.description ?? null,
    },
  });

  return { credited: true, transactionId: transaction.id };
}

/**
 * Debits a customer's wallet for a checkout redemption — atomic conditional
 * decrement (claim-then-act, never read-then-write) so two concurrent
 * redemptions from the same customer can't both succeed past their balance.
 */
export async function debitWalletForRedemption(
  tx: Tx,
  args: { shopId: string; customerId: string; amount: number; orderId: string }
): Promise<void> {
  const claimed = await tx.customer.updateMany({
    where: { id: args.customerId, shopId: args.shopId, walletBalance: { gte: args.amount } },
    data: { walletBalance: { decrement: args.amount } },
  });
  if (claimed.count === 0) throw new WalletError("Not enough wallet balance");

  const customer = await tx.customer.findUniqueOrThrow({ where: { id: args.customerId } });

  await tx.walletTransaction.create({
    data: {
      shopId: args.shopId,
      customerId: args.customerId,
      type: "REDEMPTION_DEBIT",
      amount: -args.amount,
      balanceAfter: customer.walletBalance,
      orderId: args.orderId,
      description: "Redeemed at checkout",
    },
  });
}

/** Admin-facing list of customer accounts (login accounts, not guests) with their wallet balance. */
export async function listCustomerAccounts(shopId: string, search?: string) {
  return db.customer.findMany({
    where: {
      shopId,
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] }
        : {}),
    },
    // Explicit select — never send passwordHash/firebaseUid to the client.
    select: { id: true, shopId: true, name: true, phone: true, walletBalance: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Admin manual credit/debit — delta can be positive or negative. */
export async function adjustWalletManually(
  shopId: string,
  customerId: string,
  delta: number,
  description: string | null
) {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new WalletError("Customer not found");
    if (Number(customer.walletBalance) + delta < 0) {
      throw new WalletError("This would take the wallet balance below zero");
    }

    const updated = await tx.customer.update({
      where: { id: customerId },
      data: { walletBalance: { increment: delta } },
    });

    return tx.walletTransaction.create({
      data: {
        shopId,
        customerId,
        type: "ADMIN_ADJUSTMENT",
        amount: delta,
        balanceAfter: updated.walletBalance,
        description,
      },
    });
  });
}
