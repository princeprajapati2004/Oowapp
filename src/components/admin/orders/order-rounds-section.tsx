"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { deriveOrderSource } from "@/lib/order-status";

type SessionOrder = {
  id: string;
  status: string;
  source?: string | null;
  createdAt: string;
  discountedTotal: number | null;
  grandTotal: number;
  items: { id: string; name: string; quantity: number; price: number; lineTotal: number }[];
};

/**
 * Shows every order placed against the same table session as "Round 1, 2, 3…"
 * — the table-session order rows ARE the rounds (brief §6); there's no
 * separate Round entity in the schema, so this fetches the existing session
 * detail endpoint and derives rounds purely for display. Read-only: printing,
 * payment, and status actions on this page still act on the single order
 * being viewed, unchanged.
 */
export function OrderRoundsSection({ tableSessionId, currency }: { tableSessionId: string; currency: string }) {
  const [orders, setOrders] = useState<SessionOrder[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ orders: SessionOrder[] }>(`/api/admin/table-sessions/${tableSessionId}`)
      .then((session) => {
        if (!cancelled) setOrders(session.orders);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tableSessionId]);

  if (error || !orders || orders.length < 2) return null;

  const activeOrders = orders.filter((o) => o.status !== "CANCELLED");
  const combinedTotal = activeOrders.reduce((sum, o) => sum + (o.discountedTotal ?? o.grandTotal), 0);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b bg-muted/30">
        <Layers className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order Rounds</p>
      </div>

      <div className="divide-y">
        {orders.map((round, idx) => {
          const cancelled = round.status === "CANCELLED";
          const roundTotal = round.discountedTotal ?? round.grandTotal;
          const time = new Date(round.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
          const addedBy = deriveOrderSource({ source: round.source });
          return (
            <div key={round.id} className={cancelled ? "px-4 py-3 opacity-50" : "px-4 py-3"}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  Round {idx + 1}
                  {cancelled ? " (Cancelled)" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {time} · Added by {addedBy}
                </p>
              </div>
              <div className="space-y-0.5">
                {round.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {item.name} × {item.quantity}
                    </span>
                    <span>{formatCurrency(item.lineTotal, currency)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-xs font-medium">
                <span>Round total</span>
                <span>{formatCurrency(roundTotal, currency)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between border-t bg-muted/20 px-4 py-3 font-bold text-base">
        <span>Table Running Total</span>
        <span className="text-primary">{formatCurrency(combinedTotal, currency)}</span>
      </div>
    </div>
  );
}
