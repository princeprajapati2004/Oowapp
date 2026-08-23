import { db } from "@/lib/db";
import { NotFoundError, ConflictError, InvalidCouponError } from "@/lib/api-utils";
import type { CouponInput } from "@/lib/validation/coupon";
import type { ResolvedOrderItem } from "@/lib/services/order-items";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Admin CRUD — mirrors src/lib/services/tax.ts's assertOwnedX pattern exactly.
// ---------------------------------------------------------------------------

export async function listCoupons(shopId: string) {
  return db.coupon.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    include: { categories: { include: { category: true } }, products: { include: { product: true } } },
  });
}

async function assertOwnedCoupon(shopId: string, id: string) {
  const coupon = await db.coupon.findFirst({ where: { id, shopId } });
  if (!coupon) throw new NotFoundError("Coupon not found");
  return coupon;
}

async function assertCategoriesBelongToShop(shopId: string, categoryIds: string[]) {
  if (categoryIds.length === 0) return;
  const count = await db.category.count({ where: { id: { in: categoryIds }, shopId } });
  if (count !== categoryIds.length) throw new NotFoundError("One or more categories not found");
}

async function assertProductsBelongToShop(shopId: string, productIds: string[]) {
  if (productIds.length === 0) return;
  const count = await db.product.count({ where: { id: { in: productIds }, shopId } });
  if (count !== productIds.length) throw new NotFoundError("One or more products not found");
}

function toCouponData(input: CouponInput) {
  return {
    code: normalizeCode(input.code),
    description: input.description || null,
    discountType: input.discountType,
    discountValue: input.discountValue,
    maxDiscountAmount: input.maxDiscountAmount ?? null,
    minOrderAmount: input.minOrderAmount ?? null,
    totalUsageLimit: input.totalUsageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit ?? null,
    startsAt: input.startsAt ?? null,
    expiresAt: input.expiresAt ?? null,
    isEnabled: input.isEnabled,
  };
}

export async function createCoupon(shopId: string, input: CouponInput) {
  await assertCategoriesBelongToShop(shopId, input.categoryIds);
  await assertProductsBelongToShop(shopId, input.productIds);

  const existing = await db.coupon.findUnique({
    where: { shopId_code: { shopId, code: normalizeCode(input.code) } },
  });
  if (existing) throw new ConflictError("A coupon with this code already exists");

  return db.coupon.create({
    data: {
      shopId,
      ...toCouponData(input),
      categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      products: { create: input.productIds.map((productId) => ({ productId })) },
    },
    include: { categories: { include: { category: true } }, products: { include: { product: true } } },
  });
}

export async function updateCoupon(shopId: string, id: string, input: CouponInput) {
  await assertOwnedCoupon(shopId, id);
  await assertCategoriesBelongToShop(shopId, input.categoryIds);
  await assertProductsBelongToShop(shopId, input.productIds);

  const existing = await db.coupon.findUnique({
    where: { shopId_code: { shopId, code: normalizeCode(input.code) } },
  });
  if (existing && existing.id !== id) throw new ConflictError("A coupon with this code already exists");

  return db.coupon.update({
    where: { id },
    data: {
      ...toCouponData(input),
      categories: { deleteMany: {}, create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      products: { deleteMany: {}, create: input.productIds.map((productId) => ({ productId })) },
    },
    include: { categories: { include: { category: true } }, products: { include: { product: true } } },
  });
}

export async function deleteCoupon(shopId: string, id: string) {
  const coupon = await assertOwnedCoupon(shopId, id);
  // Used coupons must be disabled, not deleted — deleting would cascade away
  // the CouponRedemption audit trail behind orders that already relied on it.
  if (coupon.usageCount > 0) {
    throw new ConflictError("This coupon has already been used and can't be deleted — disable it instead");
  }
  await db.coupon.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Checkout-facing validation/redemption
// ---------------------------------------------------------------------------

type CouponWithRestrictions = Prisma.CouponGetPayload<{
  include: { categories: true; products: true };
}>;

/** Eligible subtotal + the raw discount amount for a coupon against a set of resolved order items. Pure — no DB writes. */
function computeDiscount(coupon: CouponWithRestrictions, items: ResolvedOrderItem[]): number {
  let base = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (coupon.categories.length > 0 || coupon.products.length > 0) {
    const allowedCategoryIds = new Set(coupon.categories.map((c) => c.categoryId));
    const allowedProductIds = new Set(coupon.products.map((p) => p.productId));
    base = items
      .filter((item) => allowedProductIds.has(item.productId) || allowedCategoryIds.has(item.categoryId))
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (base <= 0) throw new InvalidCouponError("This coupon doesn't apply to any items in your cart");
  }

  let discount =
    coupon.discountType === "PERCENTAGE" ? (base * Number(coupon.discountValue)) / 100 : Number(coupon.discountValue);
  if (coupon.maxDiscountAmount != null) discount = Math.min(discount, Number(coupon.maxDiscountAmount));
  return round2(Math.max(0, discount));
}

async function findEligibleCoupon(
  client: Tx | typeof db,
  shopId: string,
  code: string,
  subtotal: number
): Promise<CouponWithRestrictions> {
  const coupon = await client.coupon.findFirst({
    where: { shopId, code: normalizeCode(code), isEnabled: true },
    include: { categories: true, products: true },
  });
  if (!coupon) throw new InvalidCouponError("Invalid coupon code");

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) throw new InvalidCouponError("This coupon isn't active yet");
  if (coupon.expiresAt && now > coupon.expiresAt) throw new InvalidCouponError("This coupon has expired");
  if (coupon.minOrderAmount != null && subtotal < Number(coupon.minOrderAmount)) {
    throw new InvalidCouponError(`Minimum order of ₹${Number(coupon.minOrderAmount)} required for this coupon`);
  }
  return coupon;
}

/** Read-only preview for the customer-facing "Apply" button — never claims usage. */
export async function previewCoupon(
  shopId: string,
  code: string,
  items: ResolvedOrderItem[],
  customerId: string | null
): Promise<{ couponId: string; code: string; discountAmount: number; description: string | null }> {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const coupon = await findEligibleCoupon(db, shopId, code, subtotal);

  if (coupon.totalUsageLimit != null && coupon.usageCount >= coupon.totalUsageLimit) {
    throw new InvalidCouponError("This coupon has reached its usage limit");
  }
  if (coupon.perCustomerLimit != null) {
    if (!customerId) throw new InvalidCouponError("Please log in to use this coupon");
    const priorCount = await db.couponRedemption.count({ where: { couponId: coupon.id, customerId } });
    if (priorCount >= coupon.perCustomerLimit) throw new InvalidCouponError("You've already used this coupon");
  }

  const discountAmount = computeDiscount(coupon, items);
  return { couponId: coupon.id, code: coupon.code, discountAmount, description: coupon.description };
}

/**
 * Validates a coupon and computes its discount, inside the order-creation
 * transaction, BEFORE the order exists. Split from claimCouponForOrder below
 * because the atomic usage claim needs the order's id (CouponRedemption.orderId
 * is a required FK) but Order.couponId/couponDiscountAmount need to be known
 * before tx.order.create — so the caller: computes this, creates the order
 * with these values baked in, then calls claimCouponForOrder with the now-real
 * order id. If the claim then fails (a genuine race), the whole interactive
 * transaction throws and rolls back, including the order — never a half-applied
 * coupon.
 */
export async function computeCouponForOrder(
  tx: Tx,
  shopId: string,
  code: string,
  items: ResolvedOrderItem[],
  customerId: string | null
): Promise<{ couponId: string; code: string; discountAmount: number; perCustomerLimit: number | null }> {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const coupon = await findEligibleCoupon(tx, shopId, code, subtotal);

  if (coupon.perCustomerLimit != null) {
    if (!customerId) throw new InvalidCouponError("Please log in to use this coupon");
    const priorCount = await tx.couponRedemption.count({ where: { couponId: coupon.id, customerId } });
    if (priorCount >= coupon.perCustomerLimit) throw new InvalidCouponError("You've already used this coupon");
  }
  if (coupon.totalUsageLimit != null && coupon.usageCount >= coupon.totalUsageLimit) {
    throw new InvalidCouponError("This coupon has reached its usage limit");
  }

  const discountAmount = computeDiscount(coupon, items);
  return { couponId: coupon.id, code: coupon.code, discountAmount, perCustomerLimit: coupon.perCustomerLimit };
}

/**
 * The atomic claim — call after tx.order.create, once a real orderId exists.
 * The total-usage limit is race-safe via a conditional updateMany (never
 * read-then-write). The per-customer limit is enforced by the count check in
 * computeCouponForOrder above — read-then-write, so a very tight concurrent
 * double-submit from the same customer could in theory both pass, but this
 * matches the same trade-off already accepted for totalUsageLimit-adjacent
 * checks elsewhere and isn't backed by a DB constraint (a customer legitimately
 * redeeming the same coupon multiple times, when perCustomerLimit allows it,
 * must not be blocked — see the CouponRedemption model comment).
 */
export async function claimCouponForOrder(
  tx: Tx,
  shopId: string,
  couponId: string,
  customerId: string | null,
  orderId: string,
  discountAmount: number
): Promise<void> {
  const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: couponId } });

  const claimed = await tx.coupon.updateMany({
    where: {
      id: couponId,
      ...(coupon.totalUsageLimit != null ? { usageCount: { lt: coupon.totalUsageLimit } } : {}),
    },
    data: { usageCount: { increment: 1 } },
  });
  if (claimed.count === 0) throw new InvalidCouponError("This coupon has reached its usage limit");

  await tx.couponRedemption.create({
    data: { shopId, couponId, orderId, customerId, discountAmount },
  });
}
