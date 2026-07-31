"use client";

import { useEffect, useRef } from "react";
import type { OrderEventOrder, TableSessionEventPayload, NotificationEventPayload } from "@/lib/server/order-events";

export type { OrderEventOrder, TableSessionEventPayload, NotificationEventPayload };

type OrderEventHandlers = {
  onCreated?: (order: OrderEventOrder) => void;
  onUpdated?: (order: OrderEventOrder) => void;
  onSessionUpdated?: (session: TableSessionEventPayload) => void;
  onNotification?: (notification: NotificationEventPayload) => void;
};

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 15_000;

/**
 * Subscribes to a live order SSE stream for as long as the calling component
 * is mounted. Reconnects with backoff on drop — EventSource's own
 * auto-reconnect is disabled once we call close(), so backoff is manual.
 */
export function useOrderEvents(endpoint: string, { onCreated, onUpdated, onSessionUpdated, onNotification }: OrderEventHandlers) {
  const onCreatedRef = useRef(onCreated);
  const onUpdatedRef = useRef(onUpdated);
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  const onNotificationRef = useRef(onNotification);

  // Runs after every render (no deps) so the refs never go stale, without
  // reconnecting the EventSource whenever the caller passes new inline
  // functions — refs must be written in an effect, not during render.
  useEffect(() => {
    onCreatedRef.current = onCreated;
    onUpdatedRef.current = onUpdated;
    onSessionUpdatedRef.current = onSessionUpdated;
    onNotificationRef.current = onNotification;
  });

  useEffect(() => {
    // Empty endpoint means "nothing to subscribe to yet" (e.g. a table
    // session id that hasn't loaded) — skip connecting rather than opening
    // an EventSource against the current page URL.
    if (!endpoint) return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = INITIAL_RETRY_MS;
    let stopped = false;

    function parseOrder(event: Event): OrderEventOrder | null {
      try {
        return JSON.parse((event as MessageEvent).data).order as OrderEventOrder;
      } catch {
        return null;
      }
    }

    function parseSession(event: Event): TableSessionEventPayload | null {
      try {
        return JSON.parse((event as MessageEvent).data).session as TableSessionEventPayload;
      } catch {
        return null;
      }
    }

    function parseNotification(event: Event): NotificationEventPayload | null {
      try {
        return JSON.parse((event as MessageEvent).data).notification as NotificationEventPayload;
      } catch {
        return null;
      }
    }

    function connect() {
      if (stopped) return;
      source = new EventSource(endpoint);

      source.addEventListener("open", () => {
        retryDelay = INITIAL_RETRY_MS;
      });

      source.addEventListener("order.created", (event) => {
        const order = parseOrder(event);
        if (order) onCreatedRef.current?.(order);
      });

      source.addEventListener("order.updated", (event) => {
        const order = parseOrder(event);
        if (order) onUpdatedRef.current?.(order);
      });

      source.addEventListener("session.created", (event) => {
        const session = parseSession(event);
        if (session) onSessionUpdatedRef.current?.(session);
      });

      source.addEventListener("session.updated", (event) => {
        const session = parseSession(event);
        if (session) onSessionUpdatedRef.current?.(session);
      });

      source.addEventListener("notification.created", (event) => {
        const notification = parseNotification(event);
        if (notification) onNotificationRef.current?.(notification);
      });

      source.onerror = () => {
        source?.close();
        if (stopped) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [endpoint]);
}
