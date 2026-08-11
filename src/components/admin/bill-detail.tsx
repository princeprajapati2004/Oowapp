"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import QRCode from "qrcode";
import { ArrowLeft, Download, Tag, X, ReceiptText, QrCode as QrCodeIcon, Printer, Share2, CheckCircle2, PartyPopper, Loader2, Barcode, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { useBillActions, isOrderPaid, type BillOrderData, type BillShopData } from "@/lib/hooks/use-bill-actions";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PAYMENT_METHODS,
  PAYMENT_LABELS,
  PAYMENT_BADGE_CLASS,
  paymentMethodLabel,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";
import { OrderTimeline } from "@/components/admin/orders/order-timeline";

export type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

function MarkPaidSection({
  order,
  currency,
  onMarkedPaid,
}: {
  order: BillOrderData;
  currency: string;
  onMarkedPaid: (patch: Partial<BillOrderData>) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]["value"]>("CASH");
  const [transactionReference, setTransactionReference] = useState("");
  const [saving, setSaving] = useState(false);
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const isPaid = isOrderPaid(order);
  const finalTotal = order.discountedTotal ?? (order.subtotal + order.taxTotal);
  const remaining = Math.max(0, finalTotal - (order.paidAmount ?? 0));

  async function handleConfirm() {
    setSaving(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, {
        action: "mark_paid",
        paymentMethod: method,
        transactionReference: transactionReference.trim() || undefined,
      });
      onMarkedPaid({
        paymentMethod: method,
        paymentStatus: "PAID",
        paidAmount: finalTotal,
        transactionReference: transactionReference.trim() || null,
      });
      setShowForm(false);
      toast.success("Order marked as paid");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to mark as paid");
    } finally {
      setSaving(false);
    }
  }

  if (isPaid) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20 px-4 py-3">
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">
          Paid via {paymentMethodLabel(order.paymentMethod)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
        <ReceiptText className="size-3.5 text-muted-foreground" />
        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Payment</p>
        <span className={cn("ml-auto text-xs rounded-full px-2 py-0.5 font-medium", PAYMENT_BADGE_CLASS[paymentStatus])}>
          {PAYMENT_LABELS[paymentStatus]}
        </span>
      </div>

      {!showForm ? (
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Amount due: <span className="font-semibold text-foreground">{formatCurrency(remaining, currency)}</span>
          </p>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowForm(true)}>
            <CheckCircle2 className="size-3.5" /> Mark as Paid
          </Button>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Amount due</span>
            <span className="font-bold">{formatCurrency(remaining, currency)}</span>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How did they pay?</p>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
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
          <Input
            value={transactionReference}
            onChange={(e) => setTransactionReference(e.target.value)}
            placeholder="Transaction reference (optional)"
            className="h-9"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1 gap-1.5" onClick={handleConfirm} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirm Paid
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscountSection({
  order,
  currency,
  onDiscountApplied,
}: {
  order: BillOrderData;
  currency: string;
  onDiscountApplied: (updated: Partial<BillOrderData>) => void;
}) {
  const [mode, setMode] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const hasDiscount = !!order.discountType;
  const base = order.subtotal + order.taxTotal;

  async function applyDiscount() {
    const num = parseFloat(value);
    if (!num || num <= 0) {
      toast.error("Enter a valid discount amount");
      return;
    }
    if (mode === "PERCENTAGE" && num > 100) {
      toast.error("Percentage cannot exceed 100%");
      return;
    }
    if (mode === "FIXED" && num > base) {
      toast.error("Discount cannot exceed the order total");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, {
        action: "discount",
        discountType: mode,
        discountValue: num,
        discountReason: reason || undefined,
      });
      const discountAmt =
        mode === "PERCENTAGE" ? (base * num) / 100 : num;
      onDiscountApplied({
        discountType: mode,
        discountValue: num,
        discountReason: reason || null,
        discountedTotal: Math.max(0, base - discountAmt),
      });
      setShowForm(false);
      setValue("");
      setReason("");
      toast.success("Discount applied");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to apply discount");
    } finally {
      setSaving(false);
    }
  }

  async function removeDiscount() {
    setRemoving(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { action: "remove_discount" });
      onDiscountApplied({
        discountType: null,
        discountValue: null,
        discountReason: null,
        discountedTotal: null,
      });
      toast.success("Discount removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove discount");
    } finally {
      setRemoving(false);
    }
  }

  const discountAmt =
    value && parseFloat(value) > 0
      ? mode === "PERCENTAGE"
        ? (base * parseFloat(value)) / 100
        : parseFloat(value)
      : 0;

  const previewTotal = discountAmt > 0 ? Math.max(0, base - discountAmt) : null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-muted-foreground" />
          <p className="font-semibold text-sm">Apply Discount</p>
        </div>
        {hasDiscount && (
          <button
            type="button"
            onClick={removeDiscount}
            disabled={removing}
            className="text-xs text-destructive hover:underline disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        )}
      </div>

      {hasDiscount ? (
        <div className="px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {order.discountType === "PERCENTAGE"
                ? `Discount (${order.discountValue}%)`
                : "Discount (fixed)"}
            </span>
            <span className="font-medium text-emerald-600">
              −{formatCurrency(base - (order.discountedTotal ?? base), currency)}
            </span>
          </div>
          {order.discountReason && (
            <p className="text-xs text-muted-foreground">{order.discountReason}</p>
          )}
          <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
            <span>Final total</span>
            <span className="text-primary">
              {formatCurrency(order.discountedTotal ?? base, currency)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline pt-1"
          >
            Change discount
          </button>
        </div>
      ) : !showForm ? (
        <div className="px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowForm(true)}
          >
            <Tag className="size-3.5" />
            Add discount
          </Button>
        </div>
      ) : null}

      {showForm && (
        <div className="px-4 pb-4 pt-3 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("PERCENTAGE")}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors",
                mode === "PERCENTAGE"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              )}
            >
              Percentage (%)
            </button>
            <button
              type="button"
              onClick={() => setMode("FIXED")}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors",
                mode === "FIXED"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              )}
            >
              Fixed amount
            </button>
          </div>

          <Input
            type="number"
            step="0.01"
            min="0"
            max={mode === "PERCENTAGE" ? "100" : undefined}
            placeholder={mode === "PERCENTAGE" ? "e.g. 10" : "e.g. 150"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9"
          />

          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9"
          />

          {previewTotal !== null && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm border border-emerald-200 dark:border-emerald-800">
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="text-emerald-600 font-medium">
                  −{formatCurrency(discountAmt, currency)}
                </span>
              </div>
              <div className="flex justify-between font-bold mt-1">
                <span>Final total</span>
                <span className="text-primary">{formatCurrency(previewTotal, currency)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9 flex-1"
              disabled={saving}
              onClick={applyDiscount}
            >
              {saving ? "Applying…" : "Apply discount"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => { setShowForm(false); setValue(""); setReason(""); }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BillDetail({
  order: initialOrder,
  shop,
  justCreated,
}: {
  order: BillOrderData;
  shop: BillShopData;
  justCreated?: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [completingOrder, setCompletingOrder] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreatedBanner, setShowCreatedBanner] = useState(!!justCreated);
  const [trackingQr, setTrackingQr] = useState<string | null>(null);

  useEffect(() => {
    if (!shop.slug) return;
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    QRCode.toDataURL(`${base}/order/${shop.slug}/track/${order.id}`, { width: 200, margin: 1 })
      .then(setTrackingQr)
      .catch(() => {});
  }, [shop.slug, order.id]);

  const { print, share, downloadPdf, downloadingPdf, isPaid, orderType, finalTotal, discountAmt } = useBillActions(order, shop);

  function updateOrder(patch: Partial<BillOrderData>) {
    setOrder((prev) => ({ ...prev, ...patch }));
  }

  async function handleCompleteOrder() {
    setCompletingOrder(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { status: "COMPLETED" });
      updateOrder({ status: "COMPLETED" });
      toast.success("Order marked as completed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update order");
    } finally {
      setCompletingOrder(false);
    }
  }

  async function handleDeleteOrder() {
    setDeletingOrder(true);
    try {
      await api.delete(`/api/admin/orders/${order.id}`);
      router.push("/admin/orders");
      toast.success("Order deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete order");
    } finally {
      setDeletingOrder(false);
    }
  }

  useOrderEvents("/api/admin/orders/stream", {
    onUpdated: (updated) => {
      if (updated.id !== order.id) return;
      updateOrder({
        status: updated.status as OrderStatus,
        paymentStatus: updated.paymentStatus ?? order.paymentStatus,
        subtotal: updated.subtotal,
        taxTotal: updated.taxTotal,
        grandTotal: updated.grandTotal,
        discountType: updated.discountType,
        discountValue: updated.discountValue,
        discountReason: updated.discountReason,
        discountedTotal: updated.discountedTotal,
        items: updated.items.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      });
    },
  });

  return (
    <div className="max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      {showCreatedBanner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 print:hidden dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <PartyPopper className="size-5 shrink-0" />
            <p className="text-sm font-medium">Order created — here&apos;s the invoice to review, print, or share.</p>
          </div>
          <button
            onClick={() => setShowCreatedBanner(false)}
            aria-label="Dismiss"
            className="shrink-0 text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/orders" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">Bill #{order.billNumber}</h1>
            {order.tokenNumber ? (
              <span className="text-sm font-medium text-muted-foreground">Token #{order.tokenNumber}</span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                STATUS_BADGE_CLASS[order.status as OrderStatus] ?? STATUS_BADGE_CLASS.PENDING
              )}
            >
              {STATUS_LABELS[order.status as OrderStatus] ?? order.status}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                PAYMENT_BADGE_CLASS[(order.paymentStatus ?? "PENDING") as PaymentStatus]
              )}
            >
              {isPaid ? `Paid via ${paymentMethodLabel(order.paymentMethod)}` : PAYMENT_LABELS[(order.paymentStatus ?? "PENDING") as PaymentStatus]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Placed on {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {order.status === "CANCELLED" && order.cancelReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-4 py-3 text-sm print:hidden">
          <p className="font-medium text-red-700 dark:text-red-400">Cancelled</p>
          <p className="text-red-600/80 dark:text-red-400/80 text-xs mt-0.5">{order.cancelReason}</p>
          {order.cancelledAt && (
            <p className="text-red-600/60 dark:text-red-400/60 text-xs">{new Date(order.cancelledAt).toLocaleString()}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 print:hidden">
        {order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
          <Button size="sm" className="h-9 gap-1.5" disabled={completingOrder} onClick={handleCompleteOrder}>
            <CheckCircle2 className="size-4" />
            {completingOrder ? "Completing…" : "Complete Order"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-9 w-9")} aria-label="More actions">
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={print}>
              <Printer className="size-4" /> Print Bill
            </DropdownMenuItem>
            <DropdownMenuItem onClick={share}>
              <Share2 className="size-4" /> Share Bill
            </DropdownMenuItem>
            <DropdownMenuItem disabled={downloadingPdf} onClick={downloadPdf}>
              <Download className="size-4" /> Download PDF
            </DropdownMenuItem>
            {shop.enableOrderBarcodeLabels && (
              <DropdownMenuItem render={<a href={`/admin/orders/${order.id}/barcodes`} target="_blank" rel="noopener noreferrer" />}>
                <Barcode className="size-4" /> Print Barcode
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={deletingOrder} onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="size-4" /> Delete Order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Order"
        description="This order will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteOrder}
      />

      {/* Bill Card */}
      <div className="rounded-2xl border bg-card overflow-hidden print:rounded-none print:border-0">
        {/* Business header */}
        <div className="px-5 py-5 text-center border-b bg-muted/30">
          {shop.logoUrl ? (
            <Image
              src={shop.logoUrl}
              alt={shop.businessName}
              width={52}
              height={52}
              unoptimized
              className="mx-auto mb-3 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="mx-auto mb-3 size-[52px] rounded-full bg-primary/10 flex items-center justify-center">
              <ReceiptText className="size-6 text-primary" />
            </div>
          )}
          <p className="font-bold text-lg">{shop.businessName}</p>
          {shop.address ? <p className="text-xs text-muted-foreground mt-0.5">{shop.address}</p> : null}
          {shop.phone ? <p className="text-xs text-muted-foreground">{shop.phone}</p> : null}
          {shop.gstNumber ? (
            <p className="text-xs text-muted-foreground">GSTIN: {shop.gstNumber}</p>
          ) : null}
        </div>

        {/* Invoice / customer details */}
        <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm border-b">
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Invoice</span>
            <p className="font-mono font-medium">{order.billNumber}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Date</span>
            <p className="font-medium">{new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Order type</span>
            <p className="font-medium">{orderType}</p>
          </div>
          {order.customerName ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Customer</span>
              <p className="font-medium">{order.customerName}</p>
            </div>
          ) : null}
          {order.customerPhone ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Phone</span>
              <p className="font-medium">{order.customerPhone}</p>
            </div>
          ) : null}
          {shop.enableTableNumber && order.tableNumber ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Table</span>
              <p className="font-medium">{order.tableNumber}</p>
            </div>
          ) : null}
          {order.deliveryAddress ? (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Address</span>
              <p className="font-medium">{order.deliveryAddress}</p>
            </div>
          ) : null}
        </div>

        {/* Items */}
        <div className="divide-y">
          {order.items.map((item) => (
            <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(item.price, shop.currency)} × {item.quantity}
                </p>
              </div>
              <p className="font-semibold shrink-0">{formatCurrency(item.lineTotal, shop.currency)}</p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="px-5 py-4 space-y-2 border-t bg-muted/20 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotal, shop.currency)}</span>
          </div>
          {order.taxBreakdown.map((line) => (
            <div key={line.id} className="flex justify-between text-muted-foreground">
              <span>{line.name}</span>
              <span>{formatCurrency(line.amount, shop.currency)}</span>
            </div>
          ))}
          {order.discountType && discountAmt > 0 ? (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>
                {order.discountType === "PERCENTAGE"
                  ? `Discount (${order.discountValue}%)`
                  : "Discount"}
                {order.discountReason ? ` — ${order.discountReason}` : ""}
              </span>
              <span className="font-medium">−{formatCurrency(discountAmt, shop.currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
            <span>Grand Total</span>
            <span className="text-primary">{formatCurrency(finalTotal, shop.currency)}</span>
          </div>
          {order.paymentMethod ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount paid</span>
                <span>{formatCurrency(order.paidAmount ?? (isPaid ? finalTotal : 0), shop.currency)}</span>
              </div>
              {!isPaid && (
                <div className="flex justify-between font-medium text-amber-600 dark:text-amber-400">
                  <span>Balance due</span>
                  <span>{formatCurrency(Math.max(0, finalTotal - (order.paidAmount ?? 0)), shop.currency)}</span>
                </div>
              )}
              {order.transactionReference && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Transaction ref.</span>
                  <span className="font-mono text-xs">{order.transactionReference}</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Notes */}
        {order.notes ? (
          <div className="px-5 py-3 border-t text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
            <p className="mt-0.5 text-muted-foreground">{order.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Everything below is editing UI / supplementary info, not part of
          the receipt itself — hidden when printing. */}
      <div className="space-y-6 print:hidden">
      <OrderTimeline createdAt={order.createdAt} status={order.status} statusEvents={order.statusEvents ?? []} />

      {/* Payment status — only for standalone orders (table sessions manage payment
          at the session level via the Tables board). */}
      {!order.tableNumber && (
        <MarkPaidSection
          order={order}
          currency={shop.currency}
          onMarkedPaid={updateOrder}
        />
      )}

      {/* Discount Section */}
      <DiscountSection
        order={order}
        currency={shop.currency}
        onDiscountApplied={updateOrder}
      />

      {/* Payment info */}
      {(shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl) ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Payment Methods
            </p>
          </div>
          <div className="px-4 py-3 space-y-2 text-sm">
            {shop.upiId && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">UPI ID</span>
                <span className="font-medium">{shop.upiId}</span>
              </div>
            )}
            {shop.bankAccountNumber && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                <p className="font-medium text-foreground">Bank Transfer</p>
                {shop.bankName && <p className="text-muted-foreground">{shop.bankName}</p>}
                <p className="text-muted-foreground">A/C: {shop.bankAccountNumber}</p>
                {shop.bankIfsc && <p className="text-muted-foreground">IFSC: {shop.bankIfsc}</p>}
              </div>
            )}
            {shop.acceptCash && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span>Cash accepted</span>
              </div>
            )}
            {shop.paymentQrImageUrl && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                <Image
                  src={shop.paymentQrImageUrl}
                  alt="Scan to pay"
                  width={64}
                  height={64}
                  unoptimized
                  className="rounded-md border bg-white object-contain p-1"
                />
                <p className="text-xs text-muted-foreground">Scan to pay via {shop.businessName}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {trackingQr && (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={trackingQr} alt="Order tracking QR code" className="size-16 rounded-md border bg-white p-1" />
          <div className="text-xs text-muted-foreground">
            <p className="flex items-center gap-1 font-medium text-foreground">
              <QrCodeIcon className="size-3.5" /> Scan to track this order live
            </p>
            <p className="mt-0.5">Customers can follow status updates without asking at the counter.</p>
          </div>
        </div>
      )}

      <Badge variant="secondary" className="text-xs">
        Order ID: {order.id}
      </Badge>
      </div>
    </div>
  );
}
