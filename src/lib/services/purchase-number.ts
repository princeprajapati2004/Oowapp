import type { Prisma } from "@/generated/prisma/client";

/**
 * Atomically assigns the next sequential purchase number for a shop — same
 * atomic-counter convention as nextBillNumber in bill-number.ts.
 */
export async function nextPurchaseNumber(client: Prisma.TransactionClient, shopId: string): Promise<string> {
  const shop = await client.shop.update({
    where: { id: shopId },
    data: { purchaseNumberNext: { increment: 1 } },
    select: { purchaseNumberPrefix: true, purchaseNumberNext: true },
  });
  const assigned = shop.purchaseNumberNext - 1;
  return `${shop.purchaseNumberPrefix}${assigned}`;
}
