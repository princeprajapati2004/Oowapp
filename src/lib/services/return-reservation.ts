import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, ReturnError } from "@/lib/api-utils";
import { computeReturnableQuantity } from "@/lib/services/return-eligibility";

type Tx = Prisma.TransactionClient;

/**
 * Reserves `qty` units against an OrderItem's returnedQuantity — called
 * inside the creating transaction the moment a ReturnRequest is submitted
 * (before owner approval), so two concurrent return requests (owner tab +
 * customer app, or two staff members) can never both claim the same units.
 *
 * Uses a compare-and-swap `updateMany` rather than a blind `update`:
 * Postgres's row-level UPDATE locking under READ COMMITTED guarantees the
 * second of two racing transactions always sees the first one's committed
 * `returnedQuantity`, so if `count === 0` here another request beat this one
 * to it and this one must retry/fail rather than silently over-reserve.
 */
export async function reserveReturnQuantity(
  tx: Tx,
  orderItemId: string,
  qty: number
): Promise<void> {
  const item = await tx.orderItem.findUnique({
    where: { id: orderItemId },
    select: { quantity: true, returnedQuantity: true },
  });
  if (!item) {
    throw new ReturnError("Order item not found");
  }
  const returnable = computeReturnableQuantity(item);
  if (qty > returnable) {
    throw new ReturnError(
      `Only ${returnable} unit(s) of this item can still be returned`
    );
  }

  const result = await tx.orderItem.updateMany({
    where: { id: orderItemId, returnedQuantity: item.returnedQuantity },
    data: { returnedQuantity: { increment: qty } },
  });

  if (result.count === 0) {
    throw new ConflictError(
      "This item was just updated by another request — please retry"
    );
  }
}

/**
 * Rollback path for RETURN_REJECTED/CANCELLED — releases previously
 * reserved quantity back onto the OrderItem. Defensive `gte` guard so this
 * can never push returnedQuantity negative.
 */
export async function releaseReturnQuantity(
  tx: Tx,
  orderItemId: string,
  qty: number
): Promise<void> {
  await tx.orderItem.updateMany({
    where: { id: orderItemId, returnedQuantity: { gte: qty } },
    data: { returnedQuantity: { decrement: qty } },
  });
}
