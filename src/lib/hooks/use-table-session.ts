"use client";

import type { Dispatch, SetStateAction } from "react";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import type { ActiveSession } from "@/lib/types/customer";

/**
 * Keeps a table session's status/paymentMethod live for as long as the
 * caller is mounted — shared by the menu page (sticky panel) and the Final
 * Bill page (payment status) so both react to staff marking a table paid
 * without a refresh. Each caller owns its own `session` state and decides
 * what "paid" should do on its screen via `onPaid`.
 */
export function useTableSession(
  session: ActiveSession,
  setSession: Dispatch<SetStateAction<ActiveSession>>,
  onPaid?: () => void
) {
  useOrderEvents(session ? `/api/table-sessions/${session.id}/stream` : "", {
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
  });
}
