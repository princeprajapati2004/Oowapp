"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";

export function OrderConfirmDialog({
  order,
  currency,
  open,
  onOpenChange,
  onConfirmed,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (order: AdminOrderEventOrder) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "status",
        status: "CONFIRMED",
      });
      onConfirmed(updated);
      toast.success("Order confirmed");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't confirm the order");
    } finally {
      setConfirming(false);
    }
  }

  const total = order.discountedTotal ?? order.grandTotal;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm this order?</AlertDialogTitle>
          <AlertDialogDescription>The kitchen will be notified to start preparing it.</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order</span>
            <span className="font-mono font-medium">{order.billNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-medium">{order.customerName || "Walk-in Customer"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items</span>
            <span className="font-medium">{order.items.length}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 mt-1">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold">{formatCurrency(total, currency)}</span>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Confirming…" : "Confirm Order"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
