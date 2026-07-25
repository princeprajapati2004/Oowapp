"use client";

import { useEffect, useRef } from "react";
import type { OrderEventOrder } from "@/lib/server/order-events";

export type { OrderEventOrder };

type OrderEventHandlers = {
  onCreated?: (order: OrderEventOrder) => void;
  onUpdated?: (order: OrderEventOrder) => void;
};

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 15_000;

/**
 * Subscribes to the admin's live order stream for as long as the calling
 * component is mounted. Reconnects with backoff on drop — EventSource's own
 * auto-reconnect is disabled once we call close(), so backoff is manual.
 */
export function useOrderEvents({ onCreated, onUpdated }: OrderEventHandlers) {
  const onCreatedRef = useRef(onCreated);
  const onUpdatedRef = useRef(onUpdated);

  // Runs after every render (no deps) so the refs never go stale, without
  // reconnecting the EventSource whenever the caller passes new inline
  // functions — refs must be written in an effect, not during render.
  useEffect(() => {
    onCreatedRef.current = onCreated;
    onUpdatedRef.current = onUpdated;
  });

  useEffect(() => {
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

    function connect() {
      if (stopped) return;
      source = new EventSource("/api/admin/orders/stream");

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
  }, []);
}
