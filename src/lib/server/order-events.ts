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
  tableSessionId: string | null;
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
  taxBreakdown: unknown;
  items: OrderEventItem[];
};

export type TableSessionEventPayload = {
  id: string;
  shopId: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  billRequestedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderEvent =
  | { type: "order.created"; order: OrderEventOrder }
  | { type: "order.updated"; order: OrderEventOrder }
  | { type: "session.created"; session: TableSessionEventPayload }
  | { type: "session.updated"; session: TableSessionEventPayload };

type RawSessionForEvent = {
  id: string;
  shopId: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  billRequestedAt: unknown;
  paidAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

export function toTableSessionEvent(session: RawSessionForEvent): TableSessionEventPayload {
  return {
    id: session.id,
    shopId: session.shopId,
    tableNumber: session.tableNumber,
    status: session.status,
    customerName: session.customerName,
    billRequestedAt: session.billRequestedAt ? (session.billRequestedAt as Date).toISOString() : null,
    paidAt: session.paidAt ? (session.paidAt as Date).toISOString() : null,
    createdAt: (session.createdAt as Date).toISOString(),
    updatedAt: (session.updatedAt as Date).toISOString(),
  };
}

type RawOrderForEvent = {
  id: string;
  shopId: string;
  billNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  tableNumber: string | null;
  tableSessionId: string | null;
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
  taxBreakdown: unknown;
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
    tableSessionId: order.tableSessionId,
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
    taxBreakdown: order.taxBreakdown,
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

const HEARTBEAT_INTERVAL_MS = 20_000;

// Shared by every SSE route (admin dashboard, public order tracking): opens a
// ReadableStream subscribed to one shop's channel, optionally narrowed with
// `filter` — the public per-order route uses this to make sure a customer
// only ever receives events for their own order, never a shop-mate's.
export function createOrderEventStream(
  request: Request,
  shopId: string,
  filter?: (event: OrderEvent) => boolean
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller already closed by the time this event fired — ignore.
        }
      };

      send("connected", { ok: true });

      const unsubscribe = subscribeOrderEvents(shopId, (event) => {
        if (filter && !filter(event)) return;
        send(event.type, event);
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // ignore — cleanup happens on abort
        }
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Reverse proxies (nginx) buffer streamed responses by default, which
      // would delay every event until the buffer fills — disable it.
      "X-Accel-Buffering": "no",
    },
  });
}
