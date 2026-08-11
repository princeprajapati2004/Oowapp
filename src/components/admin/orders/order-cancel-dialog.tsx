"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api-client";
import { CANCEL_REASONS } from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";

export function OrderCancelDialog({
  order,
  open,
  onOpenChange,
  onCancelled,
}: {
  order: AdminOrderEventOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: (order: AdminOrderEventOrder) => void;
}) {
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number]>("Customer cancelled");
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "cancel",
        reason,
        note: note.trim() || undefined,
      });
      onCancelled(updated);
      toast.success("Order cancelled");
      onOpenChange(false);
      setNote("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel the order");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this order?</DialogTitle>
          <DialogDescription>
            Order {order.billNumber} will be marked cancelled. This can&apos;t be undone from here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reason</label>
            <Select value={reason} onValueChange={(v) => setReason(v as (typeof CANCEL_REASONS)[number])}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue>{reason}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add more detail…"
              className="min-h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancelling}>
            Keep Order
          </Button>
          <Button
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? "Cancelling…" : "Cancel Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
