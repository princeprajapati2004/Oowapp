"use client";

import { useEffect, useRef } from "react";
import type { OrderEventOrder, TableSessionEventPayload, NotificationEventPayload, KotEventPayload } from "@/lib/server/order-events";

export type { OrderEventOrder, TableSessionEventPayload, NotificationEventPayload, KotEventPayload };

type OrderEventHandlers = {
  onCreated?: (order: OrderEventOrder) => void;
  onUpdated?: (order: OrderEventOrder) => void;
  onSessionUpdated?: (session: TableSessionEventPayload) => void;
  onNotification?: (notification: NotificationEventPayload) => void;
  onKotCreated?: (kot: KotEventPayload) => void;
  onKotUpdated?: (kot: KotEventPayload) => void;
};

type HandlerKind = keyof OrderEventHandlers;
type Dispatch = (kind: HandlerKind, payload: unknown) => void;

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 15_000;

type SharedConnection = {
  source: EventSource | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryDelay: number;
  stopped: boolean;
  dispatchers: Set<Dispatch>;
  refCount: number;
};

// One real EventSource per endpoint, shared across every component mounted
// in the tab that subscribes to it. Several admin components (notification
// bell in the shell header, the dashboard, orders/tables managers, the bill
// detail modal) all independently listen to the same
// `/api/admin/orders/stream` endpoint — without this, each one opened its
// own connection, so a single open tab could hold 2-3+ concurrent long-lived
// connections to the same shop channel. Module-scoped (not React context) so
// it works across the whole tab regardless of where in the tree a consumer
// mounts, same rationale as the orderEventBus singleton on the server side.
const sharedConnections = new Map<string, SharedConnection>();

function parseField<T>(event: Event, field: string): T | null {
  try {
    return JSON.parse((event as MessageEvent).data)[field] as T;
  } catch {
    return null;
  }
}

function getOrCreateConnection(endpoint: string): SharedConnection {
  const existing = sharedConnections.get(endpoint);
  if (existing) return existing;

  const conn: SharedConnection = {
    source: null,
    retryTimer: null,
    retryDelay: INITIAL_RETRY_MS,
    stopped: false,
    dispatchers: new Set(),
    refCount: 0,
  };
  sharedConnections.set(endpoint, conn);

  const broadcast = (kind: HandlerKind, payload: unknown) => {
    conn.dispatchers.forEach((dispatch) => dispatch(kind, payload));
  };

  function connect() {
    if (conn.stopped) return;
    const source = new EventSource(endpoint);
    conn.source = source;

    source.addEventListener("open", () => {
      conn.retryDelay = INITIAL_RETRY_MS;
    });

    source.addEventListener("order.created", (event) => {
      const order = parseField<OrderEventOrder>(event, "order");
      if (order) broadcast("onCreated", order);
    });

    source.addEventListener("order.updated", (event) => {
      const order = parseField<OrderEventOrder>(event, "order");
      if (order) broadcast("onUpdated", order);
    });

    source.addEventListener("session.created", (event) => {
      const session = parseField<TableSessionEventPayload>(event, "session");
      if (session) broadcast("onSessionUpdated", session);
    });

    source.addEventListener("session.updated", (event) => {
      const session = parseField<TableSessionEventPayload>(event, "session");
      if (session) broadcast("onSessionUpdated", session);
    });

    source.addEventListener("notification.created", (event) => {
      const notification = parseField<NotificationEventPayload>(event, "notification");
      if (notification) broadcast("onNotification", notification);
    });

    source.addEventListener("kot.created", (event) => {
      const kot = parseField<KotEventPayload>(event, "kot");
      if (kot) broadcast("onKotCreated", kot);
    });

    source.addEventListener("kot.updated", (event) => {
      const kot = parseField<KotEventPayload>(event, "kot");
      if (kot) broadcast("onKotUpdated", kot);
    });

    source.onerror = () => {
      source.close();
      if (conn.stopped) return;
      conn.retryTimer = setTimeout(connect, conn.retryDelay);
      conn.retryDelay = Math.min(conn.retryDelay * 2, MAX_RETRY_MS);
    };
  }

  connect();
  return conn;
}

function releaseConnection(endpoint: string) {
  const conn = sharedConnections.get(endpoint);
  if (!conn || conn.refCount > 0) return;

  conn.stopped = true;
  if (conn.retryTimer) clearTimeout(conn.retryTimer);
  conn.source?.close();
  sharedConnections.delete(endpoint);
}

/**
 * Subscribes to a live order SSE stream for as long as the calling component
 * is mounted. Every component subscribing to the same `endpoint` shares one
 * underlying EventSource (refcounted) instead of each opening its own —
 * reconnects with backoff on drop. EventSource's own auto-reconnect is
 * disabled once we call close(), so backoff is manual.
 */
export function useOrderEvents(endpoint: string, { onCreated, onUpdated, onSessionUpdated, onNotification, onKotCreated, onKotUpdated }: OrderEventHandlers) {
  const onCreatedRef = useRef(onCreated);
  const onUpdatedRef = useRef(onUpdated);
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  const onNotificationRef = useRef(onNotification);
  const onKotCreatedRef = useRef(onKotCreated);
  const onKotUpdatedRef = useRef(onKotUpdated);

  // Runs after every render (no deps) so the refs never go stale, without
  // reconnecting the EventSource whenever the caller passes new inline
  // functions — refs must be written in an effect, not during render.
  useEffect(() => {
    onCreatedRef.current = onCreated;
    onUpdatedRef.current = onUpdated;
    onSessionUpdatedRef.current = onSessionUpdated;
    onNotificationRef.current = onNotification;
    onKotCreatedRef.current = onKotCreated;
    onKotUpdatedRef.current = onKotUpdated;
  });

  useEffect(() => {
    // Empty endpoint means "nothing to subscribe to yet" (e.g. a table
    // session id that hasn't loaded) — skip connecting rather than opening
    // an EventSource against the current page URL.
    if (!endpoint) return;

    const dispatch: Dispatch = (kind, payload) => {
      switch (kind) {
        case "onCreated":
          onCreatedRef.current?.(payload as OrderEventOrder);
          break;
        case "onUpdated":
          onUpdatedRef.current?.(payload as OrderEventOrder);
          break;
        case "onSessionUpdated":
          onSessionUpdatedRef.current?.(payload as TableSessionEventPayload);
          break;
        case "onNotification":
          onNotificationRef.current?.(payload as NotificationEventPayload);
          break;
        case "onKotCreated":
          onKotCreatedRef.current?.(payload as KotEventPayload);
          break;
        case "onKotUpdated":
          onKotUpdatedRef.current?.(payload as KotEventPayload);
          break;
      }
    };

    const conn = getOrCreateConnection(endpoint);
    conn.refCount += 1;
    conn.dispatchers.add(dispatch);

    return () => {
      conn.dispatchers.delete(dispatch);
      conn.refCount -= 1;
      releaseConnection(endpoint);
    };
  }, [endpoint]);
}
