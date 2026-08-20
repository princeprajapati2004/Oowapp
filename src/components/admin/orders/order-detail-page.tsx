"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  ArrowLeft,
  MoreHorizontal,
  Loader2,
  Printer,
  Download,
  Barcode,
  Trash2,
  Ban,
  PartyPopper,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
  deriveOrderType,
  paymentMethodLabel,
  getNextStatus,
  canCancel,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";
import { OrderItemsSummary } from "./order-items-summary";
import { OrderCancelDialog } from "./order-cancel-dialog";
import { OrderPaymentModal } from "./order-payment-modal";
import { CustomerDetailsCard } from "./customer-details-card";
import { PaymentDetailsCard } from "./payment-details-card";
import { PaymentMethodsCard } from "./payment-methods-card";
import { PaymentClaimBanner } from "./payment-claim-banner";
import { OrderActionBar } from "./order-action-bar";
import { OrderRoundsSection } from "./order-rounds-section";

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
  const [claimActionLoading, setClaimActionLoading] = useState(false);

  const status = order.status as OrderStatus;
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const orderType = deriveOrderType(order);
  const nextStatus = getNextStatus({ ...order, status });
  const canCancelNow = canCancel({ ...order, status });
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

  async function advanceStatus(next: OrderStatus) {
    setActionLoading(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "status",
        status: next,
      });
      applyUpdate(updated);
      toast.success(`Marked as ${STATUS_LABELS[next]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the order");
    } finally {
      setActionLoading(false);
    }
  }

  // One-click Approve: records the payment via the same mark_paid action the
  // full payment modal uses, pre-filled from what the customer claimed —
  // this is the real, authoritative payment record; the claim itself never
  // marks the order paid on its own.
  async function handleApprovePaymentClaim() {
    setClaimActionLoading(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "mark_paid",
        paymentMethod: order.paymentClaimMethod ?? "CASH",
        paidAmount: (order.paidAmount ?? 0) + amountDue,
      });
      applyUpdate(updated);
      toast.success("Payment approved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't approve the payment");
    } finally {
      setClaimActionLoading(false);
    }
  }

  async function handleRejectPaymentClaim() {
    setClaimActionLoading(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "reject_payment_claim",
      });
      applyUpdate(updated);
      toast.success("Payment claim rejected");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reject the claim");
    } finally {
      setClaimActionLoading(false);
    }
  }

  // Sends the shop's real UPI id + a working upi://pay deep link (same
  // builder the owner payment modal's own QR already uses) to the
  // customer's phone — never a fabricated amount/UPI id/payment link.
  // Every failure mode is surfaced explicitly rather than failing silently.
  function sendPaymentQrOnWhatsApp() {
    if (!order.customerPhone) {
      toast.error("Customer phone number is not available.");
      return;
    }
    if (!shop.upiId) {
      toast.error("Payment details are not configured for this restaurant.");
      return;
    }
    if (!payUri) {
      toast.error("Unable to generate payment link. Please try again.");
      return;
    }
    const message = [
      `Hello ${order.customerName || "Customer"},`,
      "",
      "Payment request for your restaurant order.",
      "",
      `Order ID: ${order.id}`,
      "",
      "Restaurant:",
      shop.businessName,
      "",
      `Order Total: ${formatCurrency(orderTotal, currency)}`,
      "",
      `Paid: ${formatCurrency(order.paidAmount ?? 0, currency)}`,
      "",
      `Remaining: ${formatCurrency(amountDue, currency)}`,
      "",
      "UPI ID:",
      shop.upiId,
      "",
      "Payment Link:",
      payUri,
      "",
      "Please complete the payment using the QR code/payment link.",
      "",
      "Thank you.",
    ].join("\n");
    const win = window.open(buildWhatsAppUrl(order.customerPhone, message), "_blank");
    if (!win) {
      toast.error("WhatsApp could not be opened. Please check WhatsApp installation or try again.");
    }
  }

  function shareReceiptOnWhatsApp() {
    if (!order.customerPhone) {
      toast.error("This order has no customer phone number to share with");
      return;
    }
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

  // PENDING already gets Cancel Order as a primary bottom-bar button — only
  // surface it in the overflow menu for later, still-cancellable states so
  // the action isn't offered twice.
  const showCancelInMenu = canCancelNow && status !== "PENDING";

  return (
    <>
      <div className="-m-4 bg-background print:hidden md:-m-6">
        <div className="sticky top-0 z-20 border-b bg-background">
          <div className="mx-auto flex h-14 max-w-[620px] items-center justify-between px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                render={<Link href="/admin/orders" />}
                nativeButton={false}
                aria-label="Back to Orders"
              >
                <ArrowLeft className="size-5" />
              </Button>
              <h1 className="truncate text-base font-semibold">Order Details</h1>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-9 w-9 shrink-0")}
                aria-label="More actions"
              >
                <MoreHorizontal className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled={printingBill} onClick={handlePrintBill}>
                  {printingBill ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />} Print Receipt
                </DropdownMenuItem>
                <DropdownMenuItem disabled={billActions.downloadingPdf} onClick={billActions.downloadPdf}>
                  <Download className="size-4" /> Download PDF
                </DropdownMenuItem>
                {shop.enableOrderBarcodeLabels && (
                  <DropdownMenuItem render={<a href={`/admin/orders/${order.id}/barcodes`} target="_blank" rel="noopener noreferrer" />}>
                    <Barcode className="size-4" /> Print Barcode
                  </DropdownMenuItem>
                )}
                {showCancelInMenu && (
                  <DropdownMenuItem variant="destructive" onClick={() => setCancelOpen(true)}>
                    <Ban className="size-4" /> Cancel Order
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" disabled={deletingOrder} onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="size-4" /> Delete Order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mx-auto max-w-[620px] space-y-3 px-3 pt-3 pb-4 sm:px-4 sm:pt-4">
          {showCreatedBanner && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400">
              <div className="flex items-center gap-2">
                <PartyPopper className="size-5 shrink-0" />
                <p className="text-sm font-medium">Order created — here&apos;s the order to review, print, or share.</p>
              </div>
              <button onClick={() => setShowCreatedBanner(false)} aria-label="Dismiss" className="shrink-0 text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300">
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="font-mono text-sm font-semibold">{order.billNumber}</span>
            {order.tokenNumber ? (
              <span className="text-xs font-medium text-muted-foreground">Token #{order.tokenNumber}</span>
            ) : null}
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE_CLASS[status])}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <div className="-mt-1 px-1">
            <p className="text-sm text-muted-foreground">{orderDateLabel}</p>
            <p className="text-sm text-muted-foreground">{orderDayTimeLabel}</p>
          </div>

          {status === "CANCELLED" && order.cancelReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900/50 dark:bg-red-900/20">
              <p className="font-medium text-red-700 dark:text-red-400">Cancelled</p>
              <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/80">{order.cancelReason}</p>
              {order.cancelledAt && <p className="text-xs text-red-600/60 dark:text-red-400/60">{new Date(order.cancelledAt).toLocaleString()}</p>}
            </div>
          )}

          <CustomerDetailsCard
            customerName={order.customerName}
            customerPhone={order.customerPhone}
            orderType={orderType}
            tableNumber={order.tableNumber}
            deliveryAddress={order.deliveryAddress}
          />

          {order.paymentClaimStatus === "PENDING" && (
            <PaymentClaimBanner
              method={order.paymentClaimMethod}
              claimedAt={order.paymentClaimAt}
              amount={amountDue}
              currency={currency}
              busy={claimActionLoading}
              onApprove={handleApprovePaymentClaim}
              onReject={handleRejectPaymentClaim}
            />
          )}

          <PaymentDetailsCard
            paymentStatus={paymentStatus}
            paymentMethod={order.paymentMethod ?? null}
            paidAmount={order.paidAmount ?? null}
            amountDue={amountDue}
            currency={currency}
          />

          {order.tableSessionId && <OrderRoundsSection tableSessionId={order.tableSessionId} currency={currency} />}

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

          <PaymentMethodsCard
            isPaid={paymentStatus === "PAID"}
            paidAmount={order.paidAmount ?? orderTotal}
            paymentMethod={order.paymentMethod ?? null}
            transactionReference={order.transactionReference}
            currency={currency}
            upiId={shop.upiId}
            businessName={shop.businessName}
            bankAccountNumber={shop.bankAccountNumber}
            bankName={shop.bankName}
            bankIfsc={shop.bankIfsc}
            acceptCash={shop.acceptCash}
            paymentQrImageUrl={shop.paymentQrImageUrl}
            paymentQr={paymentQr}
            amountDue={amountDue}
            payUri={payUri}
            // Always shown while unpaid — sendPaymentQrOnWhatsApp() itself
            // validates phone/UPI/link and surfaces a specific error for
            // whichever is missing, instead of silently hiding the button.
            canSendWhatsApp={true}
            onSendWhatsApp={sendPaymentQrOnWhatsApp}
          />

          <p className="pb-1 text-center text-xs text-muted-foreground">
            Order ID: {order.id}
          </p>
        </div>

        <div className="mx-auto max-w-[620px] px-3 sm:px-4">
          <OrderActionBar
            status={status}
            paymentStatus={paymentStatus}
            nextStatus={nextStatus}
            busy={actionLoading}
            printing={printingBill}
            onCancel={() => setCancelOpen(true)}
            onConfirm={() => nextStatus && advanceStatus(nextStatus)}
            onAdvance={advanceStatus}
            onPayment={() => setPaymentOpen(true)}
            onPrint={handlePrintBill}
            onShareReceipt={shareReceiptOnWhatsApp}
          />
        </div>
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

      <PrintOnlyBill format={shop.printFormat} order={toBillOrderData(order)} shop={shop} />
    </>
  );
}
