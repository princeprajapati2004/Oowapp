import { round2 } from "@/lib/services/billing";
import { ReturnError } from "@/lib/api-utils";

/**
 * Server-side authoritative refund math — never trust a frontend-calculated
 * amount (return-and-refund brief §8). Prorates both tax and any order-level
 * discount/coupon across the returned line by its share of the order
 * subtotal, so a returned item refunds at what was actually paid for it, not
 * its full listed price.
 *
 * order.discountedTotal, when set, already reflects EITHER a manual discount
 * OR a coupon discount (Coupon dual-writes into the same column — see the
 * Coupon model's doc comment in prisma/schema.prisma) and is computed against
 * `subtotal + taxTotal` (see the "discount" action in
 * src/app/api/admin/orders/[id]/route.ts) — i.e. it is already tax-inclusive.
 * Prorating the refund the same tax-inclusive way keeps this internally
 * consistent with how the discount itself was applied.
 */
export type RefundCalcOrder = {
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  discountedTotal: number | null;
};

export type RefundCalcOrderItem = {
  lineTotal: number;
  quantity: number;
  price: number;
};

export type ItemRefundCalculation = {
  unitPrice: number;
  allocatedDiscountPerUnit: number;
  refundableAmount: number;
};

export function calculateItemRefund(
  order: RefundCalcOrder,
  orderItem: RefundCalcOrderItem,
  returnQuantity: number
): ItemRefundCalculation {
  if (returnQuantity <= 0) {
    throw new ReturnError("Return quantity must be at least 1");
  }
  if (returnQuantity > orderItem.quantity) {
    throw new ReturnError("Return quantity can't exceed the purchased quantity");
  }

  const itemShare = order.subtotal > 0 ? orderItem.lineTotal / order.subtotal : 0;
  const totalOrderDiscount =
    order.discountedTotal != null ? Math.max(0, order.grandTotal - order.discountedTotal) : 0;

  const itemTaxShare = itemShare * order.taxTotal;
  const itemGrossWithTax = orderItem.lineTotal + itemTaxShare;
  const allocatedDiscountForLine = itemShare * totalOrderDiscount;

  const refundableLineAmount = round2(Math.max(0, itemGrossWithTax - allocatedDiscountForLine));
  const refundableUnitAmount = refundableLineAmount / orderItem.quantity;
  const allocatedDiscountPerUnit = round2(allocatedDiscountForLine / orderItem.quantity);
  const refundableAmount = round2(refundableUnitAmount * returnQuantity);

  return {
    unitPrice: orderItem.price,
    allocatedDiscountPerUnit,
    refundableAmount,
  };
}

/**
 * Caps against paidAmount (money actually collected), not grandTotal/
 * discountedTotal (money owed) — a COMPLETED/DELIVERED order isn't
 * guaranteed to be fully PAID, and refunding money that was never collected
 * would be nonsensical.
 */
export function assertRefundWithinPaidAmount(
  paidAmount: number | null,
  existingActiveRefundTotal: number,
  newRequestedAmount: number
): void {
  const paid = paidAmount ?? 0;
  const EPSILON = 0.01;
  if (existingActiveRefundTotal + newRequestedAmount > paid + EPSILON) {
    throw new ReturnError(
      "Refund amount would exceed the amount actually paid on this order"
    );
  }
}
