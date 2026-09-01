"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { isOrderReturnEligible } from "@/lib/services/return-eligibility";
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_BADGE_CLASS,
  deriveReturnNumber,
  type ReturnStatus,
} from "@/lib/return-status";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import type { AdminOrderEventOrder, ReturnEventPayload } from "@/lib/server/order-events";
import type { OrderStatus } from "@/lib/order-status";
import { ReturnRequestDialog } from "@/components/admin/returns/return-request-dialog";

export function OrderReturnsSection({
  order,
  currency,
  dialogOpen,
  onDialogOpenChange,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const [returns, setReturns] = useState<ReturnEventPayload[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ returns: ReturnEventPayload[] }>(`/api/admin/returns?orderId=${order.id}`)
      .then((res) => {
        if (!cancelled) setReturns(res.returns);
      })
      .catch(() => {
        if (!cancelled) setReturns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  useOrderEvents("/api/admin/orders/stream", {
    onReturnCreated: (r) => {
      if (r.orderId !== order.id) return;
      setReturns((prev) => {
        if (!prev) return [r];
        if (prev.some((x) => x.id === r.id)) return prev;
        return [r, ...prev];
      });
    },
    onReturnUpdated: (r) => {
      if (r.orderId !== order.id) return;
      setReturns((prev) => (prev ? prev.map((x) => (x.id === r.id ? r : x)) : prev));
    },
  });

  const hasEligibleItems = order.items.some((item) => item.quantity - item.returnedQuantity > 0);
  const canRequestReturn = isOrderReturnEligible({ status: order.status as OrderStatus }) && hasEligibleItems;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Returns & Refunds</h2>
        {canRequestReturn && (
          <Button variant="outline" size="sm" onClick={() => onDialogOpenChange(true)}>
            <RotateCcw className="size-3.5" /> Return / Refund
          </Button>
        )}
      </div>

      {returns === null ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : returns.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No returned items</p>
      ) : (
        <div className="mt-3 space-y-2">
          {returns.map((r) => {
            const status = r.status as ReturnStatus;
            return (
              <Link
                key={r.id}
                href={`/admin/returns/${r.id}`}
                className="block rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs font-semibold">{deriveReturnNumber(r.id)}</p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${RETURN_STATUS_BADGE_CLASS[status]}`}
                  >
                    {RETURN_STATUS_LABELS[status]}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {r.items.map((i) => `${i.productName} × ${i.quantity}`).join(", ")}
                </p>
                <p className="mt-1 text-sm font-semibold">{formatCurrency(r.requestedRefundAmount, currency)}</p>
              </Link>
            );
          })}
        </div>
      )}

      <ReturnRequestDialog
        order={order}
        currency={currency}
        open={dialogOpen}
        onOpenChange={onDialogOpenChange}
        onCreated={(created) =>
          setReturns((prev) => {
            if (!prev) return [created];
            if (prev.some((x) => x.id === created.id)) return prev;
            return [created, ...prev];
          })
        }
      />
    </div>
  );
}
