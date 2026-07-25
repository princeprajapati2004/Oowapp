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
    createdAt: unknown;
    items: { price: unknown; lineTotal: unknown }[];
  },
>(order: T) {
  // Destructuring (rather than `{ ...order, key: newValue }`) is required here:
  // spreading a naked generic type parameter and overriding a key produces an
  // intersection of old and new key types instead of replacing it, which lets
  // the original Decimal types leak back into the result — see
  // https://github.com/microsoft/TypeScript/issues/48486.
  const { subtotal, taxTotal, grandTotal, discountValue, discountedTotal, createdAt, items, ...rest } = order;
  return {
    ...rest,
    subtotal: Number(subtotal),
    taxTotal: Number(taxTotal),
    grandTotal: Number(grandTotal),
    discountValue: discountValue == null ? null : Number(discountValue),
    discountedTotal: discountedTotal == null ? null : Number(discountedTotal),
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
    createdAt: unknown;
    items: { price: unknown; lineTotal: unknown }[];
  },
>(orders: T[]) {
  return orders.map(serializeOrder);
}
