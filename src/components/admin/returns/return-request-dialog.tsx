"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReturnItemPicker } from "@/components/shared/return-item-picker";
import { ReturnReasonFields } from "@/components/shared/return-reason-fields";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import type { ReturnReason } from "@/lib/return-status";
import type { AdminOrderEventOrder, ReturnEventPayload } from "@/lib/server/order-events";

// Client-side estimate only, for display while the owner is picking items —
// never trusted as the real amount. The server (calculateItemRefund in
// src/lib/services/refund-calculation.ts) recomputes this authoritatively on
// submit; whatever it returns is what's actually stored.
function estimateRefund(order: AdminOrderEventOrder, selected: Record<string, number>): number {
  const subtotal = order.subtotal;
  const taxTotal = order.taxTotal;
  const grandTotal = order.grandTotal;
  const totalDiscount = order.discountedTotal != null ? Math.max(0, grandTotal - order.discountedTotal) : 0;

  let total = 0;
  for (const item of order.items) {
    const qty = selected[item.id];
    if (!qty) continue;
    const itemShare = subtotal > 0 ? item.lineTotal / subtotal : 0;
    const itemGrossWithTax = item.lineTotal + itemShare * taxTotal;
    const allocatedDiscount = itemShare * totalDiscount;
    const refundableUnit = Math.max(0, itemGrossWithTax - allocatedDiscount) / item.quantity;
    total += refundableUnit * qty;
  }
  return Math.round(total * 100) / 100;
}

export function ReturnRequestDialog({
  order,
  currency,
  open,
  onOpenChange,
  onCreated,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (returnRequest: ReturnEventPayload) => void;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>("WRONG_ITEM");
  const [reasonOtherText, setReasonOtherText] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const itemCount = Object.keys(selected).length;
  const estimatedRefund = estimateRefund(order, selected);

  function reset() {
    setSelected({});
    setReason("WRONG_ITEM");
    setReasonOtherText("");
    setNotes("");
    setEvidenceUrls([]);
  }

  async function handleSubmit() {
    if (itemCount === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    if (reason === "OTHER" && !reasonOtherText.trim()) {
      toast.error("Please describe the reason for return");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.post<ReturnEventPayload>("/api/admin/returns", {
        orderId: order.id,
        items: Object.entries(selected).map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        reason,
        reasonOtherText: reason === "OTHER" ? reasonOtherText.trim() : undefined,
        notes: notes.trim() || undefined,
        evidencePhotoUrls: evidenceUrls,
      });
      onCreated(created);
      toast.success("Return request created");
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the return request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return / Refund Items</DialogTitle>
          <DialogDescription>Order {order.billNumber}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ReturnItemPicker items={order.items} selected={selected} onChange={setSelected} currency={currency} />

          {itemCount > 0 && (
            <>
              <ReturnReasonFields
                reason={reason}
                onReasonChange={setReason}
                reasonOtherText={reasonOtherText}
                onReasonOtherTextChange={setReasonOtherText}
                notes={notes}
                onNotesChange={setNotes}
                evidenceUrls={evidenceUrls}
                onEvidenceChange={setEvidenceUrls}
                uploadEndpoint="/api/admin/returns/upload"
              />

              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
                <span className="text-sm font-medium">Estimated Refund Amount</span>
                <span className="text-sm font-semibold">{formatCurrency(estimatedRefund, currency)}</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || itemCount === 0}>
            {submitting ? "Submitting…" : "Submit Return Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
