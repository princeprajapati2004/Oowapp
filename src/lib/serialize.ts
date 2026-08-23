/**
 * Prisma's Decimal fields are class instances that React Server Components
 * cannot pass as props to Client Components. Convert to plain numbers first.
 */
export function serializeProduct<T extends { price: unknown }>(product: T) {
  return { ...product, price: Number(product.price) };
}

export function serializeProducts<T extends { price: unknown }>(products: T[]) {
  return products.map(serializeProduct);
}

export function serializeTax<T extends { value: unknown }>(tax: T) {
  return { ...tax, value: Number(tax.value) };
}

export function serializeTaxes<T extends { value: unknown }>(taxes: T[]) {
  return taxes.map(serializeTax);
}

export function serializeOrder<
  T extends {
    subtotal: unknown;
    taxTotal: unknown;
    grandTotal: unknown;
    discountValue: unknown;
    discountedTotal: unknown;
    couponDiscountAmount?: unknown;
    walletAmountUsed?: unknown;
    createdAt: unknown;
    items: { price: unknown; lineTotal: unknown }[];
  },
>(order: T) {
  // Destructuring (rather than `{ ...order, key: newValue }`) is required here:
  // spreading a naked generic type parameter and overriding a key produces an
  // intersection of old and new key types instead of replacing it, which lets
  // the original Decimal types leak back into the result — see
  // https://github.com/microsoft/TypeScript/issues/48486.
  const { subtotal, taxTotal, grandTotal, discountValue, discountedTotal, couponDiscountAmount, walletAmountUsed, createdAt, items, ...rest } = order;
  return {
    ...rest,
    subtotal: Number(subtotal),
    taxTotal: Number(taxTotal),
    grandTotal: Number(grandTotal),
    discountValue: discountValue == null ? null : Number(discountValue),
    discountedTotal: discountedTotal == null ? null : Number(discountedTotal),
    couponDiscountAmount: couponDiscountAmount == null ? null : Number(couponDiscountAmount),
    walletAmountUsed: walletAmountUsed == null ? null : Number(walletAmountUsed),
    createdAt: (createdAt as Date).toISOString(),
    items: items.map((item) => {
      const { price, lineTotal, ...itemRest } = item;
      return { ...itemRest, price: Number(price), lineTotal: Number(lineTotal) };
    }),
  };
}

export function serializeOrders<
  T extends {
    subtotal: unknown;
    taxTotal: unknown;
    grandTotal: unknown;
    discountValue: unknown;
    discountedTotal: unknown;
    couponDiscountAmount?: unknown;
    walletAmountUsed?: unknown;
    createdAt: unknown;
    items: { price: unknown; lineTotal: unknown }[];
  },
>(orders: T[]) {
  return orders.map(serializeOrder);
}

export function serializeCoupon<
  T extends {
    discountValue: unknown;
    maxDiscountAmount: unknown;
    minOrderAmount: unknown;
    createdAt: unknown;
    updatedAt: unknown;
    startsAt?: unknown;
    expiresAt?: unknown;
  },
>(coupon: T) {
  const { discountValue, maxDiscountAmount, minOrderAmount, createdAt, updatedAt, startsAt, expiresAt, ...rest } = coupon;
  return {
    ...rest,
    discountValue: Number(discountValue),
    maxDiscountAmount: maxDiscountAmount == null ? null : Number(maxDiscountAmount),
    minOrderAmount: minOrderAmount == null ? null : Number(minOrderAmount),
    createdAt: (createdAt as Date).toISOString(),
    updatedAt: (updatedAt as Date).toISOString(),
    startsAt: startsAt == null ? null : (startsAt as Date).toISOString(),
    expiresAt: expiresAt == null ? null : (expiresAt as Date).toISOString(),
  };
}

export function serializeCoupons<
  T extends {
    discountValue: unknown;
    maxDiscountAmount: unknown;
    minOrderAmount: unknown;
    createdAt: unknown;
    updatedAt: unknown;
    startsAt?: unknown;
    expiresAt?: unknown;
  },
>(coupons: T[]) {
  return coupons.map(serializeCoupon);
}

export function serializeWalletTransaction<
  T extends { amount: unknown; balanceAfter: unknown; createdAt: unknown },
>(transaction: T) {
  const { amount, balanceAfter, createdAt, ...rest } = transaction;
  return {
    ...rest,
    amount: Number(amount),
    balanceAfter: Number(balanceAfter),
    createdAt: (createdAt as Date).toISOString(),
  };
}

export function serializeWalletTransactions<
  T extends { amount: unknown; balanceAfter: unknown; createdAt: unknown },
>(transactions: T[]) {
  return transactions.map(serializeWalletTransaction);
}

export function serializeCustomerAccount<
  T extends { walletBalance: unknown; createdAt: unknown; updatedAt: unknown },
>(customer: T) {
  const { walletBalance, createdAt, updatedAt, ...rest } = customer;
  return {
    ...rest,
    walletBalance: Number(walletBalance),
    createdAt: (createdAt as Date).toISOString(),
    updatedAt: (updatedAt as Date).toISOString(),
  };
}

export function serializeCustomerAccounts<
  T extends { walletBalance: unknown; createdAt: unknown; updatedAt: unknown },
>(customers: T[]) {
  return customers.map(serializeCustomerAccount);
}
