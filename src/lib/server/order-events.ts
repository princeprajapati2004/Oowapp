import { EventEmitter } from "node:events";

export type OrderEventItem = {
  id: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
};

export type OrderEventOrder = {
  id: string;
  shopId: string;
  billNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  status: string;
  // Prisma's inferred create() return type only includes these when the field
  // is explicitly passed in `data` — omitted here on the customer-order path,
  // which relies on the schema default instead. Runtime value is always present.
  paymentMethod?: string | null;
  source?: string;
  discountType: string | null;
  discountValue: number | null;
  discountReason: string | null;
  discountedTotal: number | null;
  createdAt: string;
  items: OrderEventItem[];
};

export type OrderEvent =
  | { type: "order.created"; order: OrderEventOrder }
  | { type: "order.updated"; order: OrderEventOrder };

type RawOrderForEvent = {
  id: string;
  shopId: string;
  billNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  subtotal: unknown;
  taxTotal: unknown;
  grandTotal: unknown;
  status: string;
  paymentMethod?: string | null;
  source?: string;
  discountType: string | null;
  discountValue: unknown;
  discountReason: string | null;
  discountedTotal: unknown;
  createdAt: unknown;
  items: {
    id: string;
    productId: string | null;
    name: string;
    price: unknown;
    quantity: number;
    lineTotal: unknown;
  }[];
};

// Deliberately takes a concrete (non-generic) shape and builds the result
// field-by-field. A generic `T` spread-then-overridden would leak Prisma's
// Decimal/Date types back into the result — see the note on serializeOrder in
// src/lib/serialize.ts for why that pattern doesn't work for nested arrays.
export function toOrderEvent(order: RawOrderForEvent): OrderEventOrder {
  return {
    id: order.id,
    shopId: order.shopId,
    billNumber: order.billNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    tableNumber: order.tableNumber,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    subtotal: Number(order.subtotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    status: order.status,
    paymentMethod: order.paymentMethod ?? null,
    source: order.source ?? "qr",
    discountType: order.discountType,
    discountValue: order.discountValue == null ? null : Number(order.discountValue),
    discountReason: order.discountReason,
    discountedTotal: order.discountedTotal == null ? null : Number(order.discountedTotal),
    createdAt: (order.createdAt as Date).toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
    })),
  };
}

// Module-scope pub/sub for order changes, one channel per shop. Pinned to
// globalThis so Next.js dev-mode HMR reuses the same emitter across reloads
// instead of orphaning existing SSE subscribers on a stale instance — same
// pattern as the Prisma client singleton in src/lib/db.ts.
const globalForOrderEvents = globalThis as unknown as {
  orderEventBus: EventEmitter | undefined;
};

const orderEventBus = globalForOrderEvents.orderEventBus ?? new EventEmitter();
// Each connected browser tab/device holds one listener for the lifetime of its
// SSE connection — that's expected to exceed Node's default limit of 10.
orderEventBus.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalForOrderEvents.orderEventBus = orderEventBus;
}

function channelFor(shopId: string) {
  return `shop:${shopId}`;
}

export function publishOrderEvent(shopId: string, event: OrderEvent) {
  orderEventBus.emit(channelFor(shopId), event);
}

export function subscribeOrderEvents(shopId: string, listener: (event: OrderEvent) => void) {
  const channel = channelFor(shopId);
  orderEventBus.on(channel, listener);
  return () => {
    orderEventBus.off(channel, listener);
  };
}
