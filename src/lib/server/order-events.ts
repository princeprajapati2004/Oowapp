import { EventEmitter } from "node:events";
import { computeOrderReturnBadge, computeOrderTotalRefunded, type OrderReturnBadge } from "@/lib/services/return-eligibility";
import type { ReturnStatus } from "@/generated/prisma/enums";

export type OrderEventItem = {
  id: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  // Reserved-or-physically-returned quantity — quantity minus this is what's
  // still eligible for a new return request. See computeReturnableQuantity
  // in src/lib/services/return-eligibility.ts.
  returnedQuantity: number;
};

// A status-change entry safe to show a customer — no `changedBy` (that's an
// internal admin/staff/system identifier, stripped before this reaches them).
export type PublicStatusEvent = {
  status: string;
  changedAt: string;
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
  paymentStatus?: string;
  // How much of this order has been collected so far — the customer's own
  // money, safe to expose (unlike the admin-only fields below: who confirmed
  // it, internal notes, cancellation trail). Needed so the customer's own
  // Payment Details view can show Paid/Remaining from the same backend
  // record the owner sees, rather than guessing from paymentStatus alone.
  paidAmount: number | null;
  // Customer's own "I've paid" claim — also safe to expose, since it's the
  // customer's own action, not internal staff metadata.
  paymentClaimStatus: string | null;
  paymentClaimMethod: string | null;
  paymentClaimAt: string | null;
  source?: string;
  discountType: string | null;
  discountValue: number | null;
  discountReason: string | null;
  discountedTotal: number | null;
  // Manual Kitchen Display marker ("VIP" | "RUSH"), set via PATCH .../orders/[id] {action:"priority"}.
  priorityFlag: string | null;
  createdAt: string;
  taxBreakdown: unknown;
  items: OrderEventItem[];
  statusEvents?: PublicStatusEvent[];
  // Present only when the caller's query actually included it (order-history
  // and order-tracking do; most other toOrderEvent callers don't need it and
  // leave it undefined) — never fetched unless there's a real reason to.
  review?: { id: string; rating: number; reviewText: string | null } | null;
  // Small "Partially/Fully Returned" indicator — same opt-in convention as
  // `review` above. Undefined unless the caller's query included
  // returnRequests (order-search.ts, customer orders/track routes do).
  returnBadge?: OrderReturnBadge;
  // Sum of actually-REFUNDED returns — same opt-in convention, computed from
  // the same returnRequests include as returnBadge. Never mutates paidAmount
  // itself; purely a display figure ("Refund" / "Net Paid" next to Payment
  // Details).
  totalRefunded?: number;
};

// Superset of OrderEventOrder used ONLY by admin-facing routes — carries
// fields that must never reach a customer (internal notes, cancellation
// trail, transaction reference, who confirmed payment/changed status).
export type AdminOrderEventOrder = OrderEventOrder & {
  tokenNumber: number | null;
  transactionReference: string | null;
  paymentConfirmedBy: string | null;
  paymentConfirmedAt: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  ownerNote: string | null;
  staffId: string | null;
  statusEvents: (PublicStatusEvent & { changedBy: string | null })[];
  paymentRecords: PaymentRecordPayload[];
};

export type PaymentRecordPayload = {
  id: string;
  amount: number;
  method: string;
  transactionReference: string | null;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
};

type RawPaymentRecordForEvent = {
  id: string;
  amount: unknown;
  method: string;
  transactionReference: string | null;
  note: string | null;
  recordedBy: string | null;
  createdAt: unknown;
};

export function toPaymentRecordPayload(record: RawPaymentRecordForEvent): PaymentRecordPayload {
  return {
    id: record.id,
    amount: Number(record.amount),
    method: record.method,
    transactionReference: record.transactionReference,
    note: record.note,
    recordedBy: record.recordedBy,
    createdAt: (record.createdAt as Date).toISOString(),
  };
}

export type TableSessionEventPayload = {
  id: string;
  shopId: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  billRequestedAt: string | null;
  paidAt: string | null;
  // Set by admin's existing "Mark as Paid" action ("CASH" | "UPI" | etc.) —
  // exposed so the customer's Final Bill screen can show "Paid (Cash)" vs
  // "Paid (Online)" once settled.
  paymentMethod: string | null;
  // Cumulative amount collected so far — less than the session's computed
  // grand total while a partial payment is outstanding, null until the
  // first payment. See closeTable() in the table-sessions API route.
  paidAmount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationEventPayload = {
  id: string;
  shopId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

// Lightweight — list/detail consumers use this only to know *something*
// changed (update a row in place, or trigger a REST refetch by id match),
// same convention as order.updated (see order-detail-page.tsx's
// useOrderEvents handler, which always re-fetches rather than trusting the
// SSE payload for full detail). No internal actor ids (approvedById etc.) —
// safe to forward on the customer per-order stream too.
export type ReturnEventPayload = {
  id: string;
  shopId: string;
  orderId: string;
  orderBillNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  reason: string;
  requestedRefundAmount: number;
  items: { productName: string; quantity: number }[];
  createdAt: string;
  updatedAt: string;
};

export type OrderEvent =
  | { type: "order.created"; order: OrderEventOrder }
  | { type: "order.updated"; order: OrderEventOrder }
  | { type: "session.created"; session: TableSessionEventPayload }
  | { type: "session.updated"; session: TableSessionEventPayload }
  | { type: "notification.created"; notification: NotificationEventPayload }
  | { type: "return.created"; return: ReturnEventPayload }
  | { type: "return.updated"; return: ReturnEventPayload };

type RawReturnForEvent = {
  id: string;
  shopId: string;
  orderId: string;
  status: string;
  reason: string;
  requestedRefundAmount: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  order: { billNumber: string; customerName: string | null; customerPhone: string | null };
  items: { productName: string; quantity: number }[];
};

export function toReturnEvent(returnRequest: RawReturnForEvent): ReturnEventPayload {
  return {
    id: returnRequest.id,
    shopId: returnRequest.shopId,
    orderId: returnRequest.orderId,
    orderBillNumber: returnRequest.order.billNumber,
    customerName: returnRequest.order.customerName,
    customerPhone: returnRequest.order.customerPhone,
    status: returnRequest.status,
    reason: returnRequest.reason,
    requestedRefundAmount: Number(returnRequest.requestedRefundAmount),
    items: returnRequest.items.map((i) => ({ productName: i.productName, quantity: i.quantity })),
    createdAt: (returnRequest.createdAt as Date).toISOString(),
    updatedAt: (returnRequest.updatedAt as Date).toISOString(),
  };
}

type RawSessionForEvent = {
  id: string;
  shopId: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  billRequestedAt: unknown;
  paidAt: unknown;
  paymentMethod?: string | null;
  paidAmount?: unknown;
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
    paymentMethod: session.paymentMethod ?? null,
    paidAmount: session.paidAmount != null ? Number(session.paidAmount) : null,
    createdAt: (session.createdAt as Date).toISOString(),
    updatedAt: (session.updatedAt as Date).toISOString(),
  };
}

type RawNotificationForEvent = {
  id: string;
  shopId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: unknown;
};

export function toNotificationEvent(notification: RawNotificationForEvent): NotificationEventPayload {
  return {
    id: notification.id,
    shopId: notification.shopId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    isRead: notification.isRead,
    createdAt: (notification.createdAt as Date).toISOString(),
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
  paymentStatus?: string;
  paidAmount: unknown;
  paymentClaimStatus: string | null;
  paymentClaimMethod: string | null;
  paymentClaimAt: unknown;
  source?: string;
  discountType: string | null;
  discountValue: unknown;
  discountReason: string | null;
  discountedTotal: unknown;
  priorityFlag: string | null;
  createdAt: unknown;
  taxBreakdown: unknown;
  items: {
    id: string;
    productId: string | null;
    name: string;
    price: unknown;
    quantity: number;
    lineTotal: unknown;
    returnedQuantity?: number;
  }[];
  statusEvents?: { status: string; changedAt: unknown; changedBy: string | null }[];
  review?: { id: string; rating: number; reviewText: string | null } | null;
  returnRequests?: { status: string; requestedRefundAmount: unknown; items: { quantity: number }[] }[];
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
    paymentStatus: order.paymentStatus ?? "PENDING",
    paidAmount: order.paidAmount == null ? null : Number(order.paidAmount),
    paymentClaimStatus: order.paymentClaimStatus,
    paymentClaimMethod: order.paymentClaimMethod,
    paymentClaimAt: order.paymentClaimAt ? (order.paymentClaimAt as Date).toISOString() : null,
    source: order.source ?? "qr",
    discountType: order.discountType,
    discountValue: order.discountValue == null ? null : Number(order.discountValue),
    discountReason: order.discountReason,
    discountedTotal: order.discountedTotal == null ? null : Number(order.discountedTotal),
    priorityFlag: order.priorityFlag ?? null,
    createdAt: (order.createdAt as Date).toISOString(),
    taxBreakdown: order.taxBreakdown,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
      returnedQuantity: item.returnedQuantity ?? 0,
    })),
    // changedBy is internal (admin/staff id, or "customer") — never sent to a customer.
    statusEvents: order.statusEvents?.map((e) => ({
      status: e.status,
      changedAt: (e.changedAt as Date).toISOString(),
    })),
    review:
      order.review === undefined
        ? undefined
        : order.review
          ? { id: order.review.id, rating: order.review.rating, reviewText: order.review.reviewText }
          : null,
    returnBadge:
      order.returnRequests === undefined
        ? undefined
        : computeOrderReturnBadge(
            order.items.map((i) => ({ quantity: i.quantity })),
            order.returnRequests.map((r) => ({ status: r.status as ReturnStatus, items: r.items }))
          ),
    totalRefunded:
      order.returnRequests === undefined
        ? undefined
        : computeOrderTotalRefunded(
            order.returnRequests.map((r) => ({
              status: r.status as ReturnStatus,
              requestedRefundAmount: Number(r.requestedRefundAmount),
            }))
          ),
  };
}

type RawOrderForAdminEvent = RawOrderForEvent & {
  tokenNumber: number | null;
  transactionReference: string | null;
  paymentConfirmedBy: string | null;
  paymentConfirmedAt: unknown;
  cancelReason: string | null;
  cancelledAt: unknown;
  cancelledBy: string | null;
  ownerNote: string | null;
  staffId: string | null;
  statusEvents?: { status: string; changedAt: unknown; changedBy: string | null }[];
  paymentRecords?: RawPaymentRecordForEvent[];
};

// Admin-only superset — includes internal fields (owner notes, cancellation
// trail, transaction reference, who confirmed payment/changed status) that
// toOrderEvent deliberately omits. Only ever sent from api/admin/* routes,
// never published to the shared shop SSE channel (which customer tracking
// streams also listen on) — see publishOrderEvent call sites, which all use
// toOrderEvent instead.
export function toAdminOrderEvent(order: RawOrderForAdminEvent): AdminOrderEventOrder {
  const base = toOrderEvent(order);
  return {
    ...base,
    tokenNumber: order.tokenNumber,
    transactionReference: order.transactionReference,
    paymentConfirmedBy: order.paymentConfirmedBy,
    paymentConfirmedAt: order.paymentConfirmedAt ? (order.paymentConfirmedAt as Date).toISOString() : null,
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt ? (order.cancelledAt as Date).toISOString() : null,
    cancelledBy: order.cancelledBy,
    ownerNote: order.ownerNote,
    staffId: order.staffId,
    statusEvents: (order.statusEvents ?? []).map((e) => ({
      status: e.status,
      changedAt: (e.changedAt as Date).toISOString(),
      changedBy: e.changedBy,
    })),
    paymentRecords: (order.paymentRecords ?? []).map(toPaymentRecordPayload),
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
