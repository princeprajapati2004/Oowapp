import type { Prisma } from "@/generated/prisma/client";

/**
 * Atomically assigns the next sequential bill/order number for a shop.
 *
 * A single `UPDATE ... SET "billNumberNext" = "billNumberNext" + 1` is
 * atomic at the database level — Postgres serializes concurrent updates to
 * the same row, so two simultaneous callers can never be handed the same
 * number. No explicit `$transaction` wrapper is needed for that guarantee;
 * pass the ambient `tx` when called from inside one anyway, so the counter
 * bump commits/rolls back together with the order it's for.
 */
export async function nextBillNumber(client: Prisma.TransactionClient, shopId: string): Promise<string> {
  const shop = await client.shop.update({
    where: { id: shopId },
    data: { billNumberNext: { increment: 1 } },
    select: { billNumberPrefix: true, billNumberNext: true },
  });
  const assigned = shop.billNumberNext - 1;
  return `${shop.billNumberPrefix}${assigned}`;
}
