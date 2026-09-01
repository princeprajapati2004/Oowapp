"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { isOrderReturnEligibleForCustomer, computeReturnableQuantity } from "@/lib/services/return-eligibility";
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_BADGE_CLASS,
  RETURN_REASON_LABELS,
  deriveReturnNumber,
  type ReturnStatus,
  type ReturnReason,
} from "@/lib/return-status";
import type { OrderStatus } from "@/lib/order-status";
import type { OrderEventItem } from "@/lib/server/order-events";
import type { CustomerReturnDetailPayload } from "@/lib/services/return-request";
import { ReturnRequestForm } from "./return-request-form";

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "for N more days" / "today" — never negative, matches the eligibility check's own >= boundary. */
function daysRemaining(deadlineIso: string): number {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function OrderReturnsSection({
  orderId,
  billNumber,
  orderStatus,
  returnPolicyEnabledAtCompletion,
  returnDeadline,
  items,
  subtotal,
  taxTotal,
  grandTotal,
  discountedTotal,
  currency,
  returns,
  onReturnsChange,
}: {
  orderId: string;
  billNumber: string;
  orderStatus: string;
  returnPolicyEnabledAtCompletion: boolean | null;
  returnDeadline: string | null;
  items: OrderEventItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  discountedTotal: number | null;
  currency: string;
  returns: CustomerReturnDetailPayload[];
  onReturnsChange: (updater: (prev: CustomerReturnDetailPayload[]) => CustomerReturnDetailPayload[]) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);

  const hasEligibleItems = items.some((item) => computeReturnableQuantity(item) > 0);
  const eligible = isOrderReturnEligibleForCustomer({
    status: orderStatus as OrderStatus,
    returnPolicyEnabledAtCompletion,
    returnDeadline,
  });
  const canRequestReturn = eligible && hasEligibleItems;
  // Distinguishes "fulfilled but the return window itself ran out" from
  // every other reason the button might be hidden (not yet delivered, no
  // returnable items, returns disabled by the owner) — only this case gets
  // its own "period ended" message instead of just disappearing silently.
  const windowExpired =
    !eligible &&
    (orderStatus === "DELIVERED" || orderStatus === "COMPLETED") &&
    returnPolicyEnabledAtCompletion === true &&
    returnDeadline != null;

  if (returns.length === 0 && !canRequestReturn && !windowExpired) return null;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden print:hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Returns & Refunds</p>
        {canRequestReturn && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <RotateCcw className="size-3.5" /> Return / Refund
          </Button>
        )}
      </div>

      {canRequestReturn && returnDeadline && (
        <p className="px-5 pt-3 text-xs text-muted-foreground">
          Return available for {daysRemaining(returnDeadline)} more day{daysRemaining(returnDeadline) === 1 ? "" : "s"} (until{" "}
          {formatDeadline(returnDeadline)})
        </p>
      )}
      {windowExpired && returnDeadline && (
        <p className="px-5 pt-3 text-xs text-muted-foreground">Return period ended on {formatDeadline(returnDeadline)}</p>
      )}

      {returns.length === 0 ? (
        <p className="px-5 py-3 text-sm text-muted-foreground">No returned items</p>
      ) : (
        <div className="divide-y">
          {returns.map((r) => {
            const status = r.status as ReturnStatus;
            const reason = r.reason as ReturnReason;
            return (
              <div key={r.id} className="px-5 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs font-semibold">{deriveReturnNumber(r.id)}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${RETURN_STATUS_BADGE_CLASS[status]}`}>
                    {RETURN_STATUS_LABELS[status]}
                  </span>
                </div>
                <p className="text-sm">{r.items.map((i) => `${i.productName} × ${i.quantity}`).join(", ")}</p>
                <p className="text-xs text-muted-foreground">{RETURN_REASON_LABELS[reason]}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Refund Amount</span>
                  <span className="font-semibold">{formatCurrency(r.requestedRefundAmount, currency)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReturnRequestForm
        orderId={orderId}
        billNumber={billNumber}
        items={items}
        subtotal={subtotal}
        taxTotal={taxTotal}
        grandTotal={grandTotal}
        discountedTotal={discountedTotal}
        currency={currency}
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(created) => onReturnsChange((prev) => [created, ...prev])}
      />
    </div>
  );
}
