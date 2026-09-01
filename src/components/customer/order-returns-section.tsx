"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { isOrderReturnEligible, computeReturnableQuantity } from "@/lib/services/return-eligibility";
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

export function OrderReturnsSection({
  orderId,
  billNumber,
  orderStatus,
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
  const canRequestReturn = isOrderReturnEligible({ status: orderStatus as OrderStatus }) && hasEligibleItems;

  if (returns.length === 0 && !canRequestReturn) return null;

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
