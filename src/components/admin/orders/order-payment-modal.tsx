"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { buildUpiPaymentUri } from "@/lib/utils/upi";
import { PAYMENT_METHODS, UPI_FAMILY_METHODS, type PaymentMethod } from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";

export function OrderPaymentModal({
  order,
  currency,
  shop,
  open,
  onOpenChange,
  onPaid,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  shop: { upiId: string | null; paymentDisplayName: string | null; businessName: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: (order: AdminOrderEventOrder) => void;
}) {
  const total = order.discountedTotal ?? order.grandTotal;
  const alreadyPaid = order.paidAmount ?? 0;
  const remaining = Math.max(0, total - alreadyPaid);

  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState(String(remaining));
  const [transactionReference, setTransactionReference] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the form fields exactly when the dialog transitions to open —
  // "adjusting state when a prop changes" during render (React's own
  // recommended pattern for this), rather than in an effect, so opening
  // never shows a stale amount/method from a previously-viewed order.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAmount(String(remaining));
      setTransactionReference("");
      setMethod("CASH");
    }
  }

  useEffect(() => {
    if (!open || !UPI_FAMILY_METHODS.has(method) || !shop.upiId) return;
    const amountNum = parseFloat(amount) || 0;
    const uri = buildUpiPaymentUri({
      upiId: shop.upiId,
      payeeName: shop.paymentDisplayName || shop.businessName,
      amount: amountNum,
      note: order.billNumber,
    });
    let cancelled = false;
    QRCode.toDataURL(uri, { width: 200, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [open, method, amount, shop.upiId, shop.paymentDisplayName, shop.businessName, order.billNumber]);

  async function handleConfirm() {
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "mark_paid",
        paymentMethod: method,
        paidAmount: alreadyPaid + amountNum,
        transactionReference: transactionReference.trim() || undefined,
      });
      onPaid(updated);
      toast.success("Payment recorded");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't record the payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>{order.billNumber} · {order.customerName || "Walk-in Customer"}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center text-sm">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="font-semibold">{formatCurrency(total, currency)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paid</p>
            <p className="font-semibold">{formatCurrency(alreadyPaid, currency)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Remaining</p>
            <p className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(remaining, currency)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  method === m.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Payment Amount</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9"
          />
        </div>

        {qrDataUrl && UPI_FAMILY_METHODS.has(method) && (
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="UPI payment QR code" className="size-40 rounded-md border bg-white p-1" />
            {shop.upiId && <p className="text-xs text-muted-foreground">{shop.upiId}</p>}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Transaction Reference</label>
          <Input
            value={transactionReference}
            onChange={(e) => setTransactionReference(e.target.value)}
            placeholder={UPI_FAMILY_METHODS.has(method) ? "e.g. TXN987654321" : "N/A"}
            className="h-9"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="gap-1.5" onClick={handleConfirm} disabled={saving}>
            <CheckCircle2 className="size-4" />
            {saving ? "Confirming…" : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
