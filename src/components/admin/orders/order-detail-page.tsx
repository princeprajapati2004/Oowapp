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
  MoreHorizontal,
  Trash2,
  X,
  PartyPopper,
  MessageCircle,
  CheckCircle2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { PrintOnlyBill } from "@/components/printing/bill-document";
import { printBill } from "@/lib/printing/print-service";
import { printViaSystemDialog } from "@/lib/printing/adapters/system-print";
import { buildWhatsAppUrl } from "@/lib/services/whatsapp";
import { buildUpiPaymentUri } from "@/lib/utils/upi";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PAYMENT_LABELS,
  PAYMENT_BADGE_CLASS,
  deriveOrderType,
  paymentMethodLabel,
  actionLabel,
  getPrimaryActions,
  type OrderStatus,
  type PaymentStatus,
  type PrimaryAction,
} from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";
import { OrderItemsSummary } from "./order-items-summary";
import { OrderCancelDialog } from "./order-cancel-dialog";
import { OrderPaymentModal } from "./order-payment-modal";

const DIRECT_STATUS_ACTIONS: Partial<Record<PrimaryAction, OrderStatus>> = {
  confirm: "CONFIRMED",
  start_processing: "PREPARING",
  mark_ready: "READY",
  out_for_delivery: "OUT_FOR_DELIVERY",
  mark_delivered: "DELIVERED",
  complete: "COMPLETED",
};

// Each workflow step gets its own color so the footer reads at a glance
// instead of every step looking the same — same idea as STATUS_BADGE_CLASS's
// distinct-hue-per-status, applied to the action buttons that drive it.
const ACTION_COLOR_CLASS: Partial<Record<PrimaryAction, string>> = {
  start_processing: "bg-blue-600 hover:bg-blue-700 text-white",
  mark_ready: "bg-purple-600 hover:bg-purple-700 text-white",
  out_for_delivery: "bg-cyan-600 hover:bg-cyan-700 text-white",
  mark_delivered: "bg-orange-600 hover:bg-orange-700 text-white",
  complete: "bg-teal-600 hover:bg-teal-700 text-white",
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
  const [cancelOpen, setCancelOpen] = useState(false);
  // Manual Order creation auto-confirms the order and lands here with
  // openPayment=true so staff go straight to Payment instead of an extra
  // Confirm Order click — see create-order-page.tsx's handleSubmit.
  const [paymentOpen, setPaymentOpen] = useState(!!openPayment);
  const [paymentQr, setPaymentQr] = useState<string | null>(null);

  const status = order.status as OrderStatus;
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const orderType = deriveOrderType(order);
  // getPrimaryActions() derives the action list from order.status alone —
  // "payment" would otherwise keep showing at every status once the order
  // happens to already be fully paid. Payment status and order status are
  // independent, so that filter has to happen here, not in the shared
  // status-transition helper.
  const actions = getPrimaryActions({ ...order, status }).filter(
    (action) => action !== "payment" || paymentStatus !== "PAID"
  );
  const canCancelNow = !["DELIVERED", "COMPLETED", "CANCELLED"].includes(status);
  const { date: orderDateLabel, dayTime: orderDayTimeLabel } = formatOrderDateParts(order.createdAt);
  const orderTotal = order.discountedTotal ?? order.grandTotal;
  const amountDue = Math.max(0, orderTotal - (order.paidAmount ?? 0));
  // Real upi://pay deep link for THIS order's current remaining balance —
  // same builder the payment-recording modal's own QR already uses, so it's
  // never a fixed/stale amount. Recomputed whenever amountDue changes (e.g.
  // after a partial payment lowers what's still owed).
  const payUri =
    shop.upiId && amountDue > 0
      ? buildUpiPaymentUri({
          upiId: shop.upiId,
          payeeName: shop.paymentDisplayName || shop.businessName,
          amount: amountDue,
          note: order.billNumber,
        })
      : null;

  const billActions = useBillActions(toBillOrderData(order), shop);
  const [printingBill, setPrintingBill] = useState(false);

  async function handlePrintBill() {
    if (printingBill) return; // guards against a double-click firing two print jobs
    setPrintingBill(true);
    try {
      const outcome = await printBill(toBillOrderData(order), shop);
      if (!outcome.ok) {
        toast.error(outcome.error ?? "Print failed", {
          action: { label: "Print via browser", onClick: () => printViaSystemDialog() },
        });
      } else if (outcome.printer && outcome.printer.connectionType !== "SYSTEM") {
        toast.success(`Sent to ${outcome.printer.name}`);
      }
    } finally {
      setPrintingBill(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const generate = payUri ? QRCode.toDataURL(payUri, { width: 200, margin: 1 }) : Promise.resolve(null);
    generate
      .then((url) => {
        if (!cancelled) setPaymentQr(url);
      })
      .catch(() => {
        if (!cancelled) setPaymentQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payUri]);

  useOrderEvents("/api/admin/orders/stream", {
    onUpdated: (updated) => {
      if (updated.id !== order.id) return;
      api.get<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`).then(setOrder).catch(() => {});
    },
  });

  function applyUpdate(updated: AdminOrderEventOrder) {
    setOrder(updated);
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

  // Sends the shop's real UPI id + a working upi://pay deep link (same
  // builder the owner payment modal's own QR already uses) to the
  // customer's phone — never a fabricated amount/UPI id/payment link.
  function sendPaymentQrOnWhatsApp() {
    if (!order.customerPhone || !payUri || !shop.upiId) return;
    const message = [
      `*Payment Request — ${shop.businessName}*`,
      "",
      `Order: ${order.billNumber}`,
      `Amount Due: ${formatCurrency(amountDue, currency)}`,
      "",
      `UPI ID: ${shop.upiId}`,
      `Tap to pay: ${payUri}`,
      "",
      "Thank you!",
    ].join("\n");
    window.open(buildWhatsAppUrl(order.customerPhone, message), "_blank");
  }

  function shareReceiptOnWhatsApp() {
    if (!order.customerPhone) return;
    const total = order.discountedTotal ?? order.grandTotal;
    const lines = [
      `*Receipt — ${shop.businessName}*`,
      "",
      `Order: ${order.billNumber}`,
      order.customerName ? `Customer: ${order.customerName}` : null,
      "",
      "Items:",
      ...order.items.map((item) => `${item.quantity} x ${item.name} = ${formatCurrency(item.lineTotal, currency)}`),
      "",
      `Total: ${formatCurrency(total, currency)}`,
      `Payment: ${paymentMethodLabel(order.paymentMethod)} — ${PAYMENT_LABELS[paymentStatus]}`,
      `Date: ${orderDateLabel}`,
      `Time: ${orderDayTimeLabel.split(" • ")[1] ?? orderDayTimeLabel}`,
      "",
      "Thank you for your order!",
    ].filter((line): line is string => line !== null);
    window.open(buildWhatsAppUrl(order.customerPhone, lines.join("\n")), "_blank");
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
    <>
    <div className="max-w-3xl mx-auto space-y-4 print:hidden">
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
          <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/orders" />} nativeButton={false} aria-label="Back to Orders">
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
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Customer Details</p>
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
            <span className="text-muted-foreground">Order Type</span>
            <span className="font-medium">{orderType}</span>
          </div>
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
            <div className="border-t pt-1.5 mt-1.5 space-y-1.5">
              {paymentStatus === "PARTIALLY_PAID" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid Amount</span>
                  <span className="font-medium">{formatCurrency(order.paidAmount ?? 0, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{paymentStatus === "PARTIALLY_PAID" ? "Remaining" : "Amount Due"}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {formatCurrency(amountDue, currency)}
                </span>
              </div>
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

      {paymentStatus === "PAID" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden dark:border-emerald-900/50 dark:bg-emerald-900/20">
          <div className="px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="font-semibold text-sm text-emerald-800 dark:text-emerald-400">Payment Received</p>
          </div>
          <div className="px-4 pb-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-emerald-700/70 dark:text-emerald-400/70">Amount</span>
              <span className="font-medium text-emerald-800 dark:text-emerald-400">{formatCurrency(order.paidAmount ?? orderTotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700/70 dark:text-emerald-400/70">Method</span>
              <span className="font-medium text-emerald-800 dark:text-emerald-400">{paymentMethodLabel(order.paymentMethod)}</span>
            </div>
            {order.transactionReference && (
              <div className="flex justify-between">
                <span className="text-emerald-700/70 dark:text-emerald-400/70">Transaction Ref</span>
                <span className="font-medium font-mono text-xs text-emerald-800 dark:text-emerald-400">{order.transactionReference}</span>
              </div>
            )}
          </div>
        </div>
      ) : (shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl) && (
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
            {paymentQr ? (
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={paymentQr} alt="Scan to pay" width={64} height={64} className="rounded-md border bg-white object-contain p-1" />
                <p className="text-xs text-muted-foreground">
                  Scan to pay <span className="font-semibold text-foreground">{formatCurrency(amountDue, currency)}</span> via {shop.businessName}
                </p>
              </div>
            ) : (
              shop.paymentQrImageUrl && (
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <Image src={shop.paymentQrImageUrl} alt="Scan to pay" width={64} height={64} unoptimized className="rounded-md border bg-white object-contain p-1" />
                  <p className="text-xs text-muted-foreground">Scan to pay via {shop.businessName}</p>
                </div>
              )
            )}
            {payUri && (
              <Button variant="outline" className="w-full gap-1.5" render={<a href={payUri} />} nativeButton={false}>
                <CreditCard className="size-3.5" /> Pay via UPI
              </Button>
            )}
            {order.customerPhone && shop.upiId && (
              <Button
                className="w-full gap-1.5 bg-[#25d366] hover:bg-[#1ebc57] text-white print:hidden"
                onClick={sendPaymentQrOnWhatsApp}
              >
                <MessageCircle className="size-4" /> Send Payment QR & Link
              </Button>
            )}
          </div>
        </div>
      )}

      <Badge variant="secondary" className="text-xs print:hidden">
        Order ID: {order.id}
      </Badge>

      {/* Action area */}
      <div
        className="sticky bottom-0 -mx-4 sm:mx-0 border-t sm:border sm:rounded-xl bg-background sm:bg-card px-4 pt-3 flex flex-wrap items-center gap-2 print:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {actions.map((action) => {
          if (action === "confirm") {
            return (
              <Button key={action} className="flex-1 min-w-28 gap-1.5" disabled={actionLoading} onClick={() => runStatusAction(action)}>
                {actionLoading && <Loader2 className="size-3.5 animate-spin" />}
                {actionLabel(action)}
              </Button>
            );
          }
          if (action === "payment") {
            return (
              <Button
                key={action}
                className="flex-1 min-w-24 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                disabled={actionLoading}
                onClick={() => setPaymentOpen(true)}
              >
                <CreditCard className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          if (action === "receipt" || action === "print_bill") {
            return (
              <Button
                key={action}
                className="flex-1 min-w-24 gap-1.5 bg-slate-800 hover:bg-slate-900 text-white"
                disabled={printingBill}
                onClick={handlePrintBill}
              >
                {printingBill ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
                {actionLabel(action)}
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
          return (
            <Button
              key={action}
              variant={ACTION_COLOR_CLASS[action] ? undefined : "secondary"}
              className={cn("flex-1 min-w-28 gap-1.5", ACTION_COLOR_CLASS[action])}
              disabled={actionLoading}
              onClick={() => runStatusAction(action)}
            >
              {actionLoading && <Loader2 className="size-3.5 animate-spin" />}
              {actionLabel(action)}
            </Button>
          );
        })}
        {paymentStatus === "PAID" && order.customerPhone && (
          <Button
            className="flex-1 min-w-24 gap-1.5 bg-[#25d366] hover:bg-[#1ebc57] text-white"
            onClick={shareReceiptOnWhatsApp}
          >
            <MessageCircle className="size-4" /> Share Receipt
          </Button>
        )}
        {canCancelNow && (
          <Button variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCancelOpen(true)}>
            Cancel Order
          </Button>
        )}
      </div>

      <OrderCancelDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} onCancelled={applyUpdate} />
      <OrderPaymentModal order={order} currency={currency} shop={shop} open={paymentOpen} onOpenChange={setPaymentOpen} onPaid={applyUpdate} />

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
    <PrintOnlyBill format={shop.printFormat} order={toBillOrderData(order)} shop={shop} />
    </>
  );
}
