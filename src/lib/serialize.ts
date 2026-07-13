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
  T extends { subtotal: unknown; taxTotal: unknown; grandTotal: unknown; items: { price: unknown; lineTotal: unknown }[] },
>(order: T) {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    items: order.items.map((item) => ({
      ...item,
      price: Number(item.price),
      lineTotal: Number(item.lineTotal),
    })),
  };
}

export function serializeOrders<
  T extends { subtotal: unknown; taxTotal: unknown; grandTotal: unknown; items: { price: unknown; lineTotal: unknown }[] },
>(orders: T[]) {
  return orders.map(serializeOrder);
}
