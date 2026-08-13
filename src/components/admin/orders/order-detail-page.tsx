"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  MapPin,
  Hash,
  ShoppingBag,
  CreditCard,
  Loader2,
  Printer,
  Share2,
  Download,
  Barcode,
  Truck,
  StickyNote,
  MoreVertical,
  MoreHorizontal,
  Trash2,
  QrCode as QrCodeIcon,
  ReceiptText,
  Tag,
  X,
  PartyPopper,
  Wallet,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { useBillActions, type BillOrderData, type BillShopData } from "@/lib/hooks/use-bill-actions";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PAYMENT_LABELS,
  PAYMENT_BADGE_CLASS,
  deriveOrderType,
  deriveOrderSource,
  paymentMethodLabel,
  actionLabel,
  getPrimaryActions,
  type OrderStatus,
  type PaymentStatus,
  type PrimaryAction,
} from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";
import { OrderItemsSummary } from "./order-items-summary";
import { OrderTimeline } from "./order-timeline";
import { OrderConfirmDialog } from "./order-confirm-dialog";
import { OrderCancelDialog } from "./order-cancel-dialog";
import { OrderPaymentModal } from "./order-payment-modal";

const DIRECT_STATUS_ACTIONS: Partial<Record<PrimaryAction, OrderStatus>> = {
  start_processing: "PREPARING",
  mark_ready: "READY",
  out_for_delivery: "OUT_FOR_DELIVERY",
  mark_delivered: "DELIVERED",
  complete: "COMPLETED",
};

function toBillOrderData(order: AdminOrderEventOrder): BillOrderData {
  return {
    id: order.id,
    billNumber: order.billNumber,
    tokenNumber: order.tokenNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    tableNumber: order.tableNumber,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    grandTotal: order.grandTotal,
    taxBreakdown: (order.taxBreakdown as BillOrderData["taxBreakdown"]) ?? [],
    status: order.status as OrderStatus,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paidAmount: order.paidAmount,
    transactionReference: order.transactionReference,
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt,
    discountType: order.discountType,
    discountValue: order.discountValue,
    discountReason: order.discountReason,
    discountedTotal: order.discountedTotal,
    createdAt: order.createdAt,
    items: order.items,
  };
}

function DiscountTool({
  order,
  currency,
  onDiscountApplied,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  onDiscountApplied: (patch: Partial<AdminOrderEventOrder>) => void;
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
      const discountAmt = mode === "PERCENTAGE" ? (base * num) / 100 : num;
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
      onDiscountApplied({ discountType: null, discountValue: null, discountReason: null, discountedTotal: null });
      toast.success("Discount removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove discount");
    } finally {
      setRemoving(false);
    }
  }

  const discountAmt =
    value && parseFloat(value) > 0 ? (mode === "PERCENTAGE" ? (base * parseFloat(value)) / 100 : parseFloat(value)) : 0;
  const previewTotal = discountAmt > 0 ? Math.max(0, base - discountAmt) : null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden print:hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Tag className="size-3.5 text-muted-foreground" />
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Discount</p>
        </div>
        {hasDiscount && (
          <button type="button" onClick={removeDiscount} disabled={removing} className="text-xs text-destructive hover:underline disabled:opacity-50">
            {removing ? "Removing…" : "Remove"}
          </button>
        )}
      </div>

      {hasDiscount ? (
        <div className="px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {order.discountType === "PERCENTAGE" ? `Discount (${order.discountValue}%)` : "Discount (fixed)"}
            </span>
            <span className="font-medium text-emerald-600">−{formatCurrency(base - (order.discountedTotal ?? base), currency)}</span>
          </div>
          {order.discountReason && <p className="text-xs text-muted-foreground">{order.discountReason}</p>}
          <button type="button" onClick={() => setShowForm(true)} className="text-xs text-muted-foreground hover:text-foreground underline pt-1">
            Change discount
          </button>
        </div>
      ) : !showForm ? (
        <div className="px-4 py-3">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowForm(true)}>
            <Tag className="size-3.5" /> Add discount
          </Button>
        </div>
      ) : null}

      {showForm && (
        <div className="px-4 pb-4 pt-3 space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("PERCENTAGE")} className={cn("flex-1 rounded-lg border py-2 text-sm font-medium transition-colors", mode === "PERCENTAGE" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted/50")}>
              Percentage (%)
            </button>
            <button type="button" onClick={() => setMode("FIXED")} className={cn("flex-1 rounded-lg border py-2 text-sm font-medium transition-colors", mode === "FIXED" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted/50")}>
              Fixed amount
            </button>
          </div>
          <Input type="number" step="0.01" min="0" max={mode === "PERCENTAGE" ? "100" : undefined} placeholder={mode === "PERCENTAGE" ? "e.g. 10" : "e.g. 150"} value={value} onChange={(e) => setValue(e.target.value)} className="h-9" />
          <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" />
          {previewTotal !== null && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm border border-emerald-200 dark:border-emerald-800">
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="text-emerald-600 font-medium">−{formatCurrency(discountAmt, currency)}</span>
              </div>
              <div className="flex justify-between font-bold mt-1">
                <span>Final total</span>
                <span className="text-primary">{formatCurrency(previewTotal, currency)}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-9 flex-1" disabled={saving} onClick={applyDiscount}>
              {saving ? "Applying…" : "Apply discount"}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setShowForm(false); setValue(""); setReason(""); }}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderDetailPage({
  initialOrder,
  shop,
  currency,
  justCreated,
  openPayment,
}: {
  initialOrder: AdminOrderEventOrder;
  shop: BillShopData;
  currency: string;
  justCreated?: boolean;
  openPayment?: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [showCreatedBanner, setShowCreatedBanner] = useState(!!justCreated);
  const [actionLoading, setActionLoading] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Manual Order creation auto-confirms the order and lands here with
  // openPayment=true so staff go straight to Payment instead of an extra
  // Confirm Order click — see create-order-page.tsx's handleSubmit.
  const [paymentOpen, setPaymentOpen] = useState(!!openPayment);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [trackingQr, setTrackingQr] = useState<string | null>(null);
  const [party, setParty] = useState<{ id: string } | null>(null);

  const status = order.status as OrderStatus;
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const orderType = deriveOrderType(order);
  const actions = getPrimaryActions({ ...order, status });
  const canCancelNow = !["DELIVERED", "COMPLETED", "CANCELLED"].includes(status);
  const { date: orderDateLabel, dayTime: orderDayTimeLabel } = formatOrderDateParts(order.createdAt);

  const billActions = useBillActions(toBillOrderData(order), shop);

  useEffect(() => {
    if (!shop.slug) return;
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    QRCode.toDataURL(`${base}/order/${shop.slug}/track/${order.id}`, { width: 200, margin: 1 })
      .then(setTrackingQr)
      .catch(() => {});
  }, [shop.slug, order.id]);

  // This order's Party/khata-book contact, if one exists — Party has no FK
  // on Order (see prisma schema comment on the Party model), so the two are
  // matched by phone number here exactly like the admin customer directory
  // already does. Reuses the existing parties list endpoint as-is.
  useEffect(() => {
    const phone = order.customerPhone;
    let cancelled = false;
    const lookup = phone
      ? api
          .get<{ id: string; phone: string }[]>("/api/admin/parties")
          .then((parties) => parties.find((p) => p.phone === phone) ?? null)
      : Promise.resolve(null);
    lookup
      .then((found) => {
        if (!cancelled) setParty(found);
      })
      .catch(() => {
        if (!cancelled) setParty(null);
      });
    return () => {
      cancelled = true;
    };
  }, [order.customerPhone]);

  useOrderEvents("/api/admin/orders/stream", {
    onUpdated: (updated) => {
      if (updated.id !== order.id) return;
      api.get<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`).then(setOrder).catch(() => {});
    },
  });

  function applyUpdate(updated: AdminOrderEventOrder) {
    setOrder(updated);
  }

  function updatePatch(patch: Partial<AdminOrderEventOrder>) {
    setOrder((prev) => ({ ...prev, ...patch }));
  }

  async function runStatusAction(action: PrimaryAction) {
    const nextStatus = DIRECT_STATUS_ACTIONS[action];
    if (!nextStatus) return;
    setActionLoading(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "status",
        status: nextStatus,
      });
      applyUpdate(updated);
      toast.success(`Marked as ${STATUS_LABELS[nextStatus]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the order");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveNote() {
    setSavingNote(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "note",
        ownerNote: noteDraft,
      });
      applyUpdate(updated);
      toast.success("Note saved");
      setNoteOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the note");
    } finally {
      setSavingNote(false);
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

  return (
    <div className="max-w-3xl mx-auto space-y-4 print:max-w-none">
      {showCreatedBanner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 print:hidden dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <PartyPopper className="size-5 shrink-0" />
            <p className="text-sm font-medium">Order created — here&apos;s the order to review, print, or share.</p>
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

      {/* Back + page title + more-actions menu — screen chrome, hidden on print */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/orders" />} aria-label="Back to Orders">
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="truncate text-base font-semibold">Order Details</h1>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-9 w-9 shrink-0")} aria-label="More actions">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled={billActions.downloadingPdf} onClick={billActions.downloadPdf}>
              <Download className="size-4" /> Download PDF
            </DropdownMenuItem>
            {shop.enableOrderBarcodeLabels && (
              <DropdownMenuItem render={<a href={`/admin/orders/${order.id}/barcodes`} target="_blank" rel="noopener noreferrer" />}>
                <Barcode className="size-4" /> Print Barcode
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" disabled={deletingOrder} onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="size-4" /> Delete Order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="hidden print:flex items-center gap-3 pb-2 border-b">
        {shop.logoUrl ? (
          <Image src={shop.logoUrl} alt={shop.businessName} width={40} height={40} unoptimized className="rounded-full object-cover" />
        ) : null}
        <div>
          <p className="font-bold">{shop.businessName}</p>
          <p className="text-xs text-muted-foreground">
            {[shop.address, shop.phone, shop.gstNumber ? `GSTIN: ${shop.gstNumber}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {/* Order identification */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold font-mono">{order.billNumber}</h2>
          {order.tokenNumber ? <span className="text-sm font-medium text-muted-foreground">Token #{order.tokenNumber}</span> : null}
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_BADGE_CLASS[status])}>
            {STATUS_LABELS[status]}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{orderDateLabel}</p>
        <p className="text-sm text-muted-foreground">{orderDayTimeLabel}</p>
      </div>

      {status === "CANCELLED" && order.cancelReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-4 py-3 text-sm">
          <p className="font-medium text-red-700 dark:text-red-400">Cancelled</p>
          <p className="text-red-600/80 dark:text-red-400/80 text-xs mt-0.5">{order.cancelReason}</p>
          {order.cancelledAt && <p className="text-red-600/60 dark:text-red-400/60 text-xs">{new Date(order.cancelledAt).toLocaleString()}</p>}
        </div>
      )}

      {/* Customer Details */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
          <User className="size-3.5 text-muted-foreground" />
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground flex-1">Customer Details</p>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="print:hidden" />}>
              <MoreVertical className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setNoteDraft(order.ownerNote ?? ""); setNoteOpen(true); }}>
                <StickyNote className="size-3.5" /> {order.ownerNote ? "Edit Note" : "Add Note"}
              </DropdownMenuItem>
              {order.customerPhone && (
                <DropdownMenuItem render={<Link href={`/admin/orders?search=${encodeURIComponent(order.customerPhone)}`} />}>
                  <User className="size-3.5" /> View orders from this customer
                </DropdownMenuItem>
              )}
              {party && (
                <DropdownMenuItem render={<Link href={`/admin/parties/${party.id}`} />}>
                  <Wallet className="size-3.5" /> View Party Statement
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{order.customerName || "Walk-in Customer"}</span>
          </div>
          {order.customerPhone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{order.customerPhone}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order Channel</span>
            <span className="font-medium">{deriveOrderSource(order)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order Type</span>
            <span className="font-medium">{orderType}</span>
          </div>
          {order.ownerNote && (
            <div className="pt-1.5 mt-1.5 border-t print:hidden">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Owner Note</p>
              <p className="text-sm">{order.ownerNote}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Details */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
          <CreditCard className="size-3.5 text-muted-foreground" />
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Payment Details</p>
        </div>
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Status</span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", PAYMENT_BADGE_CLASS[paymentStatus])}>
              {PAYMENT_LABELS[paymentStatus]}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Method</span>
            <span className="font-medium">{paymentMethodLabel(order.paymentMethod)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Transaction Ref</span>
            <span className="font-medium font-mono text-xs">{order.transactionReference || "N/A"}</span>
          </div>
          {(paymentStatus === "PENDING" || paymentStatus === "PARTIALLY_PAID") && (
            <div className="flex justify-between border-t pt-1.5 mt-1.5">
              <span className="text-muted-foreground">Amount Due</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {formatCurrency(Math.max(0, (order.discountedTotal ?? order.grandTotal) - (order.paidAmount ?? 0)), currency)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Delivery / Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
          {orderType === "Delivery" ? <Truck className="size-3.5 text-muted-foreground" /> : <Hash className="size-3.5 text-muted-foreground" />}
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
            {orderType === "Delivery" ? "Delivery Address" : orderType === "Dine-in" ? "Table" : "Fulfillment"}
          </p>
        </div>
        <div className="px-4 py-3 text-sm">
          {orderType === "Delivery" ? (
            <p className="flex items-start gap-2">
              <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>{order.deliveryAddress}</span>
            </p>
          ) : orderType === "Dine-in" ? (
            <p className="font-medium">Table {order.tableNumber}</p>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <ShoppingBag className="size-3.5" /> Takeaway
            </p>
          )}
        </div>
      </div>

      <OrderItemsSummary
        items={order.items}
        subtotal={order.subtotal}
        taxTotal={order.taxTotal}
        taxBreakdown={(order.taxBreakdown as { id: string; name: string; amount: number }[]) ?? []}
        discountType={order.discountType}
        discountValue={order.discountValue}
        discountedTotal={order.discountedTotal}
        discountReason={order.discountReason}
        currency={currency}
      />

      <DiscountTool order={order} currency={currency} onDiscountApplied={updatePatch} />

      {(shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl) && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Payment Methods</p>
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
                <Image src={shop.paymentQrImageUrl} alt="Scan to pay" width={64} height={64} unoptimized className="rounded-md border bg-white object-contain p-1" />
                <p className="text-xs text-muted-foreground">Scan to pay via {shop.businessName}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div id="order-timeline-anchor">
        <OrderTimeline createdAt={order.createdAt} status={status} statusEvents={order.statusEvents} />
      </div>

      {trackingQr && (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 print:hidden">
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

      <Badge variant="secondary" className="text-xs print:hidden">
        Order ID: {order.id}
      </Badge>

      {/* Action area */}
      <div className="sticky bottom-0 -mx-4 sm:mx-0 border-t sm:border sm:rounded-xl bg-background sm:bg-card px-4 py-3 flex flex-wrap items-center gap-2 print:hidden">
        {actions.map((action) => {
          if (action === "confirm") {
            return (
              <Button key={action} className="flex-1 min-w-28" disabled={actionLoading} onClick={() => setConfirmOpen(true)}>
                {actionLabel(action)}
              </Button>
            );
          }
          if (action === "payment") {
            return (
              <Button key={action} variant="outline" className="flex-1 min-w-24 gap-1.5" disabled={actionLoading} onClick={() => setPaymentOpen(true)}>
                <CreditCard className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          if (action === "receipt" || action === "print_bill") {
            return (
              <Button key={action} variant="outline" className="flex-1 min-w-24 gap-1.5" onClick={billActions.print}>
                <Printer className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          if (action === "share_bill") {
            return (
              <Button key={action} variant="outline" className="flex-1 min-w-24 gap-1.5" onClick={billActions.share}>
                <Share2 className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          if (action === "tracking") {
            return (
              <Button key={action} variant="outline" className="flex-1 min-w-24 gap-1.5" render={<a href="#order-timeline-anchor" />}>
                <ReceiptText className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          return (
            <Button key={action} variant="secondary" className="flex-1 min-w-28 gap-1.5" disabled={actionLoading} onClick={() => runStatusAction(action)}>
              {actionLoading && <Loader2 className="size-3.5 animate-spin" />}
              {actionLabel(action)}
            </Button>
          );
        })}
        {canCancelNow && (
          <Button variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCancelOpen(true)}>
            Cancel Order
          </Button>
        )}
      </div>

      <OrderConfirmDialog order={order} currency={currency} open={confirmOpen} onOpenChange={setConfirmOpen} onConfirmed={applyUpdate} />
      <OrderCancelDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} onCancelled={applyUpdate} />
      <OrderPaymentModal order={order} currency={currency} shop={shop} open={paymentOpen} onOpenChange={setPaymentOpen} onPaid={applyUpdate} />

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Owner Note</DialogTitle>
          </DialogHeader>
          <Textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Internal note about this order/customer — not visible to the customer." className="min-h-24" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)} disabled={savingNote}>Cancel</Button>
            <Button onClick={saveNote} disabled={savingNote}>{savingNote ? "Saving…" : "Save Note"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Order"
        description="This order will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteOrder}
      />
    </div>
  );
}
