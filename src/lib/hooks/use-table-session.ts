"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { api } from "@/lib/api-client";
import type { ActiveSession, SessionOrderSnapshot } from "@/lib/types/customer";

/**
 * Keeps a table session's status/paymentMethod/orders live for as long as
 * the caller is mounted — shared by the menu page (sticky panel) and the
 * Final Bill page (payment status + running order) so both react to staff
 * marking a table paid, or the owner/another device adding a round, without
 * a refresh. Each caller owns its own `session` state and decides what
 * "paid" should do on its screen via `onPaid`.
 */
export function useTableSession(
  session: ActiveSession,
  setSession: Dispatch<SetStateAction<ActiveSession>>,
  onPaid?: () => void
) {
  const sessionId = session?.id;

  // order.created/order.updated on this session's stream mean a round was
  // added or edited (by the owner, staff, or another device on the same
  // table) — refetch the session's order list rather than try to merge the
  // event payload in place, since OrderEventOrder omits categoryId/imageUrl
  // (fine for the POST /api/orders response this type already tolerates,
  // see SessionOrderSnapshot, but not enough to trust for a positional
  // merge here).
  const refetchOrders = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await api.get<{ orders: SessionOrderSnapshot[] }>(`/api/table-sessions/${sessionId}`);
      setSession((prev) => (prev ? { ...prev, orders: data.orders } : prev));
    } catch {
      // Transient failure — the next SSE event or customer action resyncs.
    }
  }, [sessionId, setSession]);

  useOrderEvents(sessionId ? `/api/table-sessions/${sessionId}/stream` : "", {
    onSessionUpdated: (updated) => {
      setSession((prev) =>
        prev
          ? { ...prev, status: updated.status, billRequestedAt: updated.billRequestedAt, paymentMethod: updated.paymentMethod }
          : prev
      );
      if (updated.status === "PAID") {
        onPaid?.();
      }
    },
    onCreated: refetchOrders,
    onUpdated: refetchOrders,
  });
}
