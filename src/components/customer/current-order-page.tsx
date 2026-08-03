"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  ArrowLeft,
  ReceiptText,
  Download,
  Table2,
  Plus,
  Share2,
  Printer,
  Phone,
  Clock,
  User,
  Banknote,
  QrCode as QrCodeIcon,
  Loader2,
  RefreshCw,
  ImageOff,
  Lock,
  ChefHat,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PhoneVerification } from "@/components/customer/phone-verification";
import { ItemStatusBadge, sessionItemStatus } from "@/components/customer/item-status-badge";
import { tableSessionKey } from "@/components/customer/customer-menu";
import { formatCurrency } from "@/lib/utils/currency";
import { generateInvoicePdf } from "@/lib/utils/invoice-pdf";
import { calculateBill, mergeLineItems, type BillLineItem } from "@/lib/services/billing";
import { buildOrderMessage, buildIncrementalOrderMessage, buildWhatsAppUrl, generateBillNumber } from "@/lib/services/whatsapp";
import { buildCheckoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { api, ApiError } from "@/lib/api-client";
import { addStoredOrder } from "@/lib/order-history-storage";
import { useCart } from "@/lib/hooks/use-cart";
import { useTableSession } from "@/lib/hooks/use-table-session";
import { cn } from "@/lib/utils";
import type { ActiveSession, CustomerShop, CustomerTax } from "@/lib/types/customer";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11a16.5 16.5 0 0 1-1.62-.6c-2.85-1.23-4.7-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.93s.73-2.08.99-2.36c.26-.28.56-.35.75-.35h.53c.17 0 .4-.03.62.47.24.55.8 1.9.87 2.04.07.14.11.3.02.49-.09.19-.14.3-.28.46-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.28.36-.23.6-.14.24.09 1.55.73 1.81.86.26.14.44.2.5.32.06.12.06.68-.18 1.36Z" />
    </svg>
  );
}

function ItemThumbnail({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
      {imageUrl ? (
        <Image src={imageUrl} alt={name} fill className="object-cover" unoptimized />
      ) : (
        <div className="flex size-full items-center justify-center">
          <ImageOff className="size-4 text-muted-foreground/50" />
        </div>
      )}
    </div>
  );
}

// ── Payment options ─────────────────────────────────────────────────────────
// Shown after bill is generated (AWAITING_PAYMENT), before the admin confirms.
// Three distinct paths: scan the restaurant's QR, open a UPI app, or pay cash.
function PaymentOptions({
  shop,
  grandTotal,
  upiQrDataUrl,
  onPayViaUpi,
  onPayCash,
}: {
  shop: CustomerShop;
  grandTotal: number;
  upiQrDataUrl: string | null;
  onPayViaUpi: () => void;
  onPayCash: () => void;
}) {
  const payeeName = shop.paymentDisplayName || shop.businessName;
  const hasQr = !!(shop.paymentQrImageUrl || upiQrDataUrl);
  const hasUpi = !!shop.upiId;
  const hasCash = shop.acceptCash;
  const hasBank = !!shop.bankAccountNumber;

  if (!hasQr && !hasUpi && !hasCash && !hasBank) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-4 text-center text-sm text-muted-foreground">
        Please pay at the counter or ask the staff for payment details.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">Choose how to pay</p>

      {/* Option 1 — Scan QR (restaurant's uploaded QR or auto-generated UPI QR) */}
      {hasQr && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
            <QrCodeIcon className="size-3.5 text-muted-foreground" />
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Scan QR to Pay</p>
          </div>
          <div className="px-4 py-4 flex flex-col items-center gap-3">
            <div className="rounded-2xl border-2 border-border bg-white p-3 shadow-sm">
              {shop.paymentQrImageUrl ? (
                <Image
                  src={shop.paymentQrImageUrl}
                  alt="Scan to pay"
                  width={210}
                  height={210}
                  unoptimized
                  className="object-contain"
                />
              ) : upiQrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={upiQrDataUrl} alt="UPI payment QR code" width={210} height={210} />
              ) : null}
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(grandTotal, shop.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                Pay to <span className="font-semibold text-foreground">{payeeName}</span>
              </p>
              {shop.upiId && (
                <p className="text-xs text-muted-foreground font-mono">{shop.upiId}</p>
              )}
              <p className="text-xs text-muted-foreground pt-0.5">
                Works with Google Pay · PhonePe · Paytm · BHIM · Amazon Pay · any UPI app
              </p>
              {(shop.googlePayUpi || shop.phonePeUpi || shop.paytmUpi || shop.bhimUpi) && (
                <div className="w-full pt-2 mt-1 border-t space-y-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground text-center">Also accepts</p>
                  {shop.googlePayUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">Google Pay: {shop.googlePayUpi}</p>
                  )}
                  {shop.phonePeUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">PhonePe: {shop.phonePeUpi}</p>
                  )}
                  {shop.paytmUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">Paytm: {shop.paytmUpi}</p>
                  )}
                  {shop.bhimUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">BHIM: {shop.bhimUpi}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Option 2 — Pay via UPI App deep link */}
      {hasUpi && (
        <button
          type="button"
          onClick={onPayViaUpi}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:scale-[0.99]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
            <QrCodeIcon className="size-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Pay via UPI App</p>
            <p className="text-xs text-muted-foreground">Opens Google Pay, PhonePe, Paytm &amp; more</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm">{formatCurrency(grandTotal, shop.currency)}</p>
          </div>
        </button>
      )}

      {/* Option 3 — Pay in Cash */}
      {hasCash && (
        <button
          type="button"
          onClick={onPayCash}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:scale-[0.99]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Banknote className="size-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Pay in Cash</p>
            <p className="text-xs text-muted-foreground">Pay the bill at the counter or to the waiter</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm">{formatCurrency(grandTotal, shop.currency)}</p>
          </div>
        </button>
      )}

      {/* Bank transfer (supplementary info) */}
      {hasBank && (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs space-y-0.5">
          <p className="font-semibold text-foreground">Bank Transfer</p>
          {shop.bankName && <p className="text-muted-foreground">{shop.bankName}</p>}
          <p className="text-muted-foreground">A/C: {shop.bankAccountNumber}</p>
          {shop.bankIfsc && <p className="text-muted-foreground">IFSC: {shop.bankIfsc}</p>}
          {shop.bankAccountNumber && (
            <p className="text-muted-foreground">
              Amount: <span className="font-semibold text-foreground">{formatCurrency(grandTotal, shop.currency)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CurrentOrderPage({
  shop,
  taxes,
  prefilledTable,
  customer,
  activeSession,
  verifiedPhone,
}: {
  shop: CustomerShop;
  taxes: CustomerTax[];
  prefilledTable?: string;
  customer?: { name: string; phone: string } | null;
  activeSession: ActiveSession;
  verifiedPhone?: string | null;
}) {
  const cart = useCart(shop.slug);
  const [session, setSession] = useState<ActiveSession>(activeSession);
  const [placing, setPlacing] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);
  const [billRequestFailed, setBillRequestFailed] = useState(false);
  const [downloadingInvoicePdf, setDownloadingInvoicePdf] = useState(false);
  const [sharingInvoice, setSharingInvoice] = useState(false);
  // No payment-gateway integration behind any of this — these are just local
  // UI states while the customer waits for staff to verify the payment and
  // mark the table paid from the admin side (see admin/table-sessions PATCH
  // mark_paid). There is no customer self-confirm step.
  const [paymentIntent, setPaymentIntent] = useState<"idle" | "cash_pending" | "upi_confirm" | "upi_pending">("idle");
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string | null>(null);
  const [uploadedQrFailed, setUploadedQrFailed] = useState(false);
  const [checkoutValues, setCheckoutValues] = useState<CheckoutInput | null>(null);
  const [directOrderPlaced, setDirectOrderPlaced] = useState(false);

  const menuUrl = `/order/${shop.slug}${prefilledTable ? `?table=${encodeURIComponent(prefilledTable)}` : ""}`;

  useTableSession(session, setSession, () => {
    toast.success("Payment confirmed — thank you!");
    cart.clear();
  });

  const schema = useMemo(
    () =>
      buildCheckoutSchema({
        requireCustomerName: shop.requireCustomerName,
        requirePhone: shop.requirePhone,
        requireTableNumber: false,
        requireDeliveryAddress: shop.requireDeliveryAddress,
      }),
    [shop]
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: customer?.name,
      customerPhone: customer?.phone ?? verifiedPhone ?? undefined,
    },
  });

  const phoneValue = watch("customerPhone") ?? "";
  const [phoneVerified, setPhoneVerified] = useState(
    !!customer || (!!verifiedPhone && verifiedPhone === phoneValue)
  );

  const bill = useMemo(
    () =>
      calculateBill(
        cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId, imageUrl: i.imageUrl })),
        taxes
      ),
    [cart.items, taxes]
  );

  const alreadyOrderedItems: BillLineItem[] = useMemo(() => {
    if (!session) return [];
    return mergeLineItems(
      session.orders
        .filter((o) => o.status !== "CANCELLED")
        .flatMap((o) =>
          o.items.map((item) => ({
            id: item.productId ?? item.name,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            categoryId: item.categoryId ?? "",
            imageUrl: item.imageUrl,
          }))
        )
    );
  }, [session]);

  const isIncremental = alreadyOrderedItems.length > 0;
  const hasUnsentItems = cart.items.length > 0;

  const sessionRunningBill = useMemo(() => {
    if (!isIncremental) return null;
    const merged = mergeLineItems([
      ...alreadyOrderedItems,
      ...cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId, imageUrl: i.imageUrl })),
    ]);
    return calculateBill(merged, taxes);
  }, [isIncremental, alreadyOrderedItems, cart.items, taxes]);

  const billAlreadyRequested = session?.status === "AWAITING_PAYMENT";
  // Header/title switches from "Current Order" to "Final Bill" once the
  // customer has requested the bill (or it's already paid) — matches the
  // same moment showPaymentSection below starts rendering payment options.
  const isFinalBillView = session?.status === "AWAITING_PAYMENT" || session?.status === "PAID";
  const payeeDisplayName = shop.paymentDisplayName || shop.businessName;

  const orderNumber = session ? `INV-${session.id.slice(-8).toUpperCase()}` : "";
  const invoiceCustomerName = checkoutValues?.customerName || customer?.name || undefined;
  const invoiceCustomerPhone = checkoutValues?.customerPhone || customer?.phone || verifiedPhone || undefined;
  const invoiceTableNumber = checkoutValues?.tableNumber || prefilledTable || undefined;

  const finalInvoiceItems: BillLineItem[] = useMemo(
    () =>
      mergeLineItems([
        ...alreadyOrderedItems,
        ...cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId, imageUrl: i.imageUrl })),
      ]),
    [alreadyOrderedItems, cart.items]
  );
  const finalInvoiceBill = useMemo(() => calculateBill(finalInvoiceItems, taxes), [finalInvoiceItems, taxes]);
  const invoicePaymentStatus: "Paid" | "Unpaid" = session?.status === "PAID" ? "Paid" : "Unpaid";
  const billStatusLabel =
    invoicePaymentStatus === "Paid"
      ? session?.paymentMethod?.toUpperCase() === "CASH"
        ? "Paid (Cash)"
        : "Paid (Online)"
      : paymentIntent === "cash_pending"
        ? "Cash Approval Pending"
        : paymentIntent === "upi_pending"
          ? "Payment Pending"
          : "Bill Generated";

  async function requestBill(sessionId: string) {
    setBillRequestFailed(false);
    setRequestingBill(true);
    try {
      const res = await api.patch<{ ok: boolean; session: { status: string; billRequestedAt: string | null } }>(
        `/api/table-sessions/${sessionId}`,
        { action: "request_bill" }
      );
      setSession((prev) => (prev ? { ...prev, status: res.session.status, billRequestedAt: res.session.billRequestedAt } : prev));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSession((prev) => (prev ? { ...prev, status: "AWAITING_PAYMENT" } : prev));
      } else {
        setBillRequestFailed(true);
      }
    } finally {
      setRequestingBill(false);
    }
  }

  useEffect(() => {
    // Only generate a UPI QR when there's no uploaded payment QR — the uploaded
    // QR is the primary "Scan to Pay" option; the generated one is a fallback.
    if (!shop.upiId || shop.paymentQrImageUrl || invoicePaymentStatus === "Paid" || hasUnsentItems) {
      setUpiQrDataUrl(null);
      return;
    }
    const payeeName = shop.paymentDisplayName || shop.businessName;
    const note = [invoiceTableNumber ? `Table ${invoiceTableNumber}` : null, orderNumber || null].filter(Boolean).join(" ") || payeeName;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(payeeName)}&am=${finalInvoiceBill.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
    let cancelled = false;
    QRCode.toDataURL(upiUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setUpiQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setUpiQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shop.upiId, shop.paymentQrImageUrl, shop.paymentDisplayName, shop.businessName, finalInvoiceBill.grandTotal, invoiceTableNumber, orderNumber, invoicePaymentStatus, hasUnsentItems]);

  function buildUpiUrl() {
    const payeeName = shop.paymentDisplayName || shop.businessName;
    const note = [invoiceTableNumber ? `Table ${invoiceTableNumber}` : null, orderNumber || null].filter(Boolean).join(" ") || payeeName;
    return `upi://pay?pa=${encodeURIComponent(shop.upiId ?? "")}&pn=${encodeURIComponent(payeeName)}&am=${finalInvoiceBill.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  }

  function handleCashPayment() {
    setPaymentIntent("cash_pending");
    toast.success("Waiting for Restaurant/Admin Approval.");
  }

  function handlePayViaUpi() {
    if (!shop.upiId) return;
    window.location.href = buildUpiUrl();
    setPaymentIntent("upi_confirm");
  }

  function handleConfirmUpiPaid() {
    setPaymentIntent("upi_pending");
  }

  function handleUpiPaymentFailed() {
    setPaymentIntent("idle");
    toast.error("Payment Failed or Cancelled.");
  }

  function retryGenerateBill() {
    if (session) requestBill(session.id);
  }

  async function handleDownloadInvoicePdf() {
    setDownloadingInvoicePdf(true);
    try {
      await generateInvoicePdf({
        shop,
        billNumber: orderNumber || "PREVIEW",
        invoiceNumber: orderNumber,
        invoiceDate: session?.billRequestedAt ?? undefined,
        customerName: invoiceCustomerName,
        customerPhone: invoiceCustomerPhone,
        tableNumber: invoiceTableNumber,
        items: finalInvoiceItems,
        bill: finalInvoiceBill,
        paymentStatus: invoicePaymentStatus,
        ownerApprovalStatus: billStatusLabel,
      });
    } catch {
      toast.error("Couldn't generate the PDF — please try again.");
    } finally {
      setDownloadingInvoicePdf(false);
    }
  }

  async function handleShareInvoice() {
    const label = orderNumber || "Current Order";
    const shareData = {
      title: `${shop.businessName} — ${label}`,
      text: `My bill from ${shop.businessName} — ${label}, total ${formatCurrency(finalInvoiceBill.grandTotal, shop.currency)}`,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    };
    setSharingInvoice(true);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard && shareData.url) {
        await navigator.clipboard.writeText(shareData.url);
        toast.success("Invoice link copied to clipboard");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error("Couldn't share the invoice");
      }
    } finally {
      setSharingInvoice(false);
    }
  }

  async function handlePlaceOrder(values: CheckoutInput) {
    if (billAlreadyRequested) {
      toast.error("Bill already requested for this table — please check with staff before ordering more.");
      return;
    }
    if (shop.requirePhone && !phoneVerified) {
      toast.error("Please verify your phone number before continuing.");
      return;
    }

    const resolvedValues: CheckoutInput = {
      ...values,
      tableNumber: shop.enableTableNumber ? (values.tableNumber || prefilledTable || "") : "",
    };
    const newBillNumber = generateBillNumber(shop.slug);
    const newClientRequestId = crypto.randomUUID();
    setCheckoutValues(resolvedValues);
    setPlacing(true);

    if (shop.orderMode === "DIRECT") {
      try {
        const res = await api.post<{
          ok: boolean;
          saved: boolean;
          orderId?: string;
          tableSessionId?: string | null;
          sessionStatus?: string | null;
          sessionOrders?: { status: string; items: { productId: string | null; name: string; price: number; quantity: number; categoryId?: string; imageUrl?: string | null }[] }[];
        }>("/api/orders", {
          shopSlug: shop.slug,
          billNumber: newBillNumber,
          clientRequestId: newClientRequestId,
          customerName: resolvedValues.customerName,
          customerPhone: resolvedValues.customerPhone,
          tableNumber: resolvedValues.tableNumber,
          deliveryAddress: resolvedValues.deliveryAddress,
          notes: resolvedValues.notes,
          items: cart.items,
        });
        if (res.orderId) {
          addStoredOrder(shop.slug, { orderId: res.orderId, billNumber: newBillNumber, placedAt: new Date().toISOString() });
        }
        if (res.tableSessionId && res.sessionOrders) {
          setSession({ id: res.tableSessionId, status: res.sessionStatus ?? "ACTIVE", orders: res.sessionOrders });
          if (resolvedValues.tableNumber) {
            try {
              localStorage.setItem(tableSessionKey(shop.slug, resolvedValues.tableNumber), res.tableSessionId);
            } catch { /* ignore storage errors */ }
          }
        }
        cart.clear();
        setDirectOrderPlaced(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast.error("Bill was just requested for this table — please check with staff before ordering more.");
          setSession((prev) => (prev ? { ...prev, status: "AWAITING_PAYMENT" } : prev));
        } else {
          toast.error("Couldn't place your order — please try again.");
        }
      } finally {
        setPlacing(false);
      }
      return;
    }

    // WhatsApp mode (default) — build message, open WhatsApp, save to DB asynchronously.
    const message =
      isIncremental && sessionRunningBill
        ? buildIncrementalOrderMessage({
            tableNumber: resolvedValues.tableNumber || "",
            roundNumber: (session?.orders.length ?? 0) + 1,
            deltaItems: cart.items,
            deltaBill: bill,
            sessionBill: sessionRunningBill,
            currency: shop.currency,
            notes: resolvedValues.notes || undefined,
          })
        : buildOrderMessage({
            customerName: resolvedValues.customerName || undefined,
            customerPhone: resolvedValues.customerPhone || undefined,
            tableNumber: resolvedValues.tableNumber || undefined,
            deliveryAddress: resolvedValues.deliveryAddress || undefined,
            notes: resolvedValues.notes || undefined,
            items: cart.items,
            bill,
            currency: shop.currency,
          });
    const url = buildWhatsAppUrl(shop.whatsappNumber, message);

    api
      .post<{
        ok: boolean;
        saved: boolean;
        orderId?: string;
        tableSessionId?: string | null;
        sessionStatus?: string | null;
        sessionOrders?: {
          status: string;
          items: { productId: string | null; name: string; price: number; quantity: number; categoryId?: string; imageUrl?: string | null }[];
        }[];
      }>("/api/orders", {
        shopSlug: shop.slug,
        billNumber: newBillNumber,
        clientRequestId: newClientRequestId,
        customerName: resolvedValues.customerName,
        customerPhone: resolvedValues.customerPhone,
        tableNumber: resolvedValues.tableNumber,
        deliveryAddress: resolvedValues.deliveryAddress,
        notes: resolvedValues.notes,
        items: cart.items,
      })
      .then((res) => {
        if (res.saved && res.orderId) {
          addStoredOrder(shop.slug, { orderId: res.orderId, billNumber: newBillNumber, placedAt: new Date().toISOString() });
        }
        if (res.tableSessionId && res.sessionOrders) {
          setSession({ id: res.tableSessionId, status: res.sessionStatus ?? "ACTIVE", orders: res.sessionOrders });
          // Persist table ownership so CustomerMenu can identify this browser
          // as the session owner on the next page load — prevents other customers
          // scanning the same QR from seeing the ordering UI.
          if (resolvedValues.tableNumber) {
            try {
              localStorage.setItem(
                tableSessionKey(shop.slug, resolvedValues.tableNumber),
                res.tableSessionId
              );
            } catch {
              // ignore storage errors
            }
          }
        }
        cart.clear();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) {
          toast.error("Bill was just requested for this table — please check with staff before ordering more.");
          setSession((prev) => (prev ? { ...prev, status: "AWAITING_PAYMENT" } : prev));
        } else {
          toast.error("Sent on WhatsApp, but we couldn't sync it here — your items are still in your cart.");
        }
      })
      .finally(() => setPlacing(false));

    window.open(url, "_blank", "noopener,noreferrer");
  }

  const nothingYet = cart.hydrated && !hasUnsentItems && alreadyOrderedItems.length === 0;
  // Everything's been sent but the customer hasn't asked for the bill yet —
  // shows the "Generate Final Bill" button rather than requesting it automatically.
  const readyToGenerateBill =
    cart.hydrated && !hasUnsentItems && alreadyOrderedItems.length > 0 && session?.status === "ACTIVE";
  const showPaymentSection =
    cart.hydrated && !hasUnsentItems && alreadyOrderedItems.length > 0 && session?.status !== "ACTIVE" && !billRequestFailed;

  return (
    <div className="min-h-screen bg-muted/20 pb-10">
      <header className="sticky top-0 z-30 border-b bg-background/98 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" aria-label="Back to menu" render={<Link href={menuUrl} />} nativeButton={false}>
            <ArrowLeft className="size-4.5" />
          </Button>
          <h1 className="flex-1 truncate text-center font-bold text-base">
            {isFinalBillView
              ? prefilledTable
                ? `Table #${prefilledTable} Final Bill`
                : "Final Bill"
              : prefilledTable
                ? `Table #${prefilledTable} — Current Order`
                : "Current Order"}
          </h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-5 space-y-4">
        {!cart.hydrated ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : nothingYet ? (
          <EmptyState
            icon={ReceiptText}
            title="Nothing ordered yet"
            description="Head back to the menu to add items — your order will show up here once you do."
            action={
              <Button render={<Link href={menuUrl} />} nativeButton={false}>
                Browse Menu
              </Button>
            }
          />
        ) : (
          <>
            <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <div className="px-4 py-5 text-center border-b bg-muted/30">
                {shop.logoUrl ? (
                  <Image
                    src={shop.logoUrl}
                    alt={shop.businessName}
                    width={48}
                    height={48}
                    unoptimized
                    className="mx-auto mb-2 rounded-full object-cover ring-2 ring-border"
                  />
                ) : null}
                <p className="font-bold text-lg">{shop.businessName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isFinalBillView
                    ? prefilledTable
                      ? `Dine-In Invoice — Table #${prefilledTable}`
                      : "Invoice"
                    : prefilledTable
                      ? `Dine-In Order — Table #${prefilledTable}`
                      : "Your Order"}
                </p>
                {orderNumber && <p className="mt-2 text-xs text-muted-foreground font-mono">Order #{orderNumber}</p>}
              </div>

              {(invoiceCustomerName || invoiceCustomerPhone || session?.billRequestedAt) && (
                <div className="px-4 py-3 border-b space-y-1.5 text-sm">
                  {invoiceCustomerName && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="size-3.5 shrink-0" />
                      <span>{invoiceCustomerName}</span>
                    </div>
                  )}
                  {invoiceCustomerPhone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5 shrink-0" />
                      <span>{invoiceCustomerPhone}</span>
                    </div>
                  )}
                  {session?.billRequestedAt && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="size-3.5 shrink-0" />
                      <span>
                        {new Date(session.billRequestedAt).toLocaleString(undefined, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 py-3 space-y-3 border-b">
                {alreadyOrderedItems.length > 0 && (
                  <div className="flex items-center justify-between pb-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordered items</p>
                    <ItemStatusBadge status={sessionItemStatus(session?.status ?? "ACTIVE")} />
                  </div>
                )}
                {alreadyOrderedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 text-sm">
                    <ItemThumbnail name={item.name} imageUrl={item.imageUrl} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground ml-1">× {item.quantity}</span>
                    </div>
                    <span className="font-medium shrink-0">{formatCurrency(item.price * item.quantity, shop.currency)}</span>
                  </div>
                ))}
                {hasUnsentItems && (
                  <>
                    <div className="flex items-center justify-between pb-1 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New items</p>
                      <ItemStatusBadge status="new" />
                    </div>
                    {cart.items.map((item) => (
                      <div key={item.productId} className="flex items-center gap-3 text-sm">
                        <ItemThumbnail name={item.name} imageUrl={item.imageUrl} />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground ml-1">× {item.quantity}</span>
                        </div>
                        <span className="font-medium shrink-0">{formatCurrency(item.price * item.quantity, shop.currency)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="px-4 py-3 space-y-1.5 text-sm border-b">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(finalInvoiceBill.subtotal, shop.currency)}</span>
                </div>
                {finalInvoiceBill.taxLines.map((line) => (
                  <div key={line.id} className="flex justify-between text-muted-foreground">
                    <span>{line.name}</span>
                    <span>{formatCurrency(line.amount, shop.currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
                  <span>Grand Total</span>
                  <span className="text-primary">{formatCurrency(finalInvoiceBill.grandTotal, shop.currency)}</span>
                </div>
              </div>

              {!hasUnsentItems && alreadyOrderedItems.length > 0 && (
                <div className="px-4 py-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Bill Status</span>
                  <span
                    className={cn(
                      "font-semibold",
                      invoicePaymentStatus === "Paid" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {requestingBill ? "Generating…" : billStatusLabel}
                  </span>
                </div>
              )}
            </div>

            {hasUnsentItems && (
              <div className="rounded-2xl border bg-card p-4 space-y-4">
                {isIncremental && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                    <Lock className="size-4 mt-0.5 shrink-0" />
                    <p>Order already booked. Previously ordered items cannot be removed. Only additional items can be added.</p>
                  </div>
                )}
                <form onSubmit={handleSubmit(handlePlaceOrder)} className="space-y-4">
                  {billAlreadyRequested && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                      Bill already requested for this table — please check with staff before ordering more.
                    </div>
                  )}
                  {shop.requireCustomerName && (
                    <FormRow label="Name" htmlFor="customerName" required error={errors.customerName}>
                      <Input id="customerName" placeholder="Your name" {...register("customerName")} />
                    </FormRow>
                  )}
                  {shop.requirePhone && (
                    <PhoneVerification
                      shopSlug={shop.slug}
                      phone={phoneValue}
                      onPhoneChange={(value) => setValue("customerPhone", value, { shouldValidate: true })}
                      verified={phoneVerified}
                      onVerifiedChange={setPhoneVerified}
                      error={errors.customerPhone?.message}
                    />
                  )}
                  {shop.enableTableNumber && prefilledTable && (
                    <FormRow label="Table" htmlFor="tableDisplay">
                      <div className="relative">
                        <Table2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="tableDisplay"
                          value={prefilledTable}
                          readOnly
                          disabled
                          className="pl-8 font-semibold disabled:cursor-default disabled:bg-muted/50 disabled:opacity-100"
                        />
                      </div>
                    </FormRow>
                  )}
                  {shop.requireDeliveryAddress && (
                    <FormRow label="Delivery address" htmlFor="deliveryAddress" required error={errors.deliveryAddress}>
                      <Textarea id="deliveryAddress" rows={2} placeholder="Your full address" {...register("deliveryAddress")} />
                    </FormRow>
                  )}
                  {shop.allowNotes && (
                    <FormRow label="Special instructions" htmlFor="notes" description="Optional">
                      <Textarea id="notes" rows={2} placeholder="Allergies, preferences…" {...register("notes")} />
                    </FormRow>
                  )}

                  {shop.orderMode === "DIRECT" ? (
                    <Button
                      type="submit"
                      size="lg"
                      disabled={placing || billAlreadyRequested}
                      className="h-12 w-full gap-2 bg-primary text-primary-foreground shadow-sm"
                    >
                      {placing ? (
                        <><Loader2 className="size-4.5 animate-spin" /> Placing Order…</>
                      ) : (
                        <><ShoppingBag className="size-4.5" /> Confirm Order</>
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="lg"
                      disabled={placing || billAlreadyRequested}
                      className="h-12 w-full gap-2 bg-[#25D366] text-white hover:bg-[#1ea952] shadow-sm shadow-[#25D366]/20"
                    >
                      <WhatsAppIcon className="size-4.5" />
                      {placing ? "Opening WhatsApp…" : "Place Order on WhatsApp"}
                    </Button>
                  )}
                </form>
                <p className="text-center text-xs text-muted-foreground">
                  Payment options appear here once your order is sent.
                </p>
              </div>
            )}

            {directOrderPlaced && !hasUnsentItems && (
              <div className="rounded-2xl border bg-card p-8 flex flex-col items-center gap-4 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <ChefHat className="size-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-bold">Order Sent to Kitchen!</p>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ve received your order. Your food is being prepared.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="mt-2 gap-1.5"
                  onClick={() => setDirectOrderPlaced(false)}
                  render={<Link href={menuUrl} />}
                  nativeButton={false}
                >
                  <Plus className="size-4" /> Add More Items
                </Button>
              </div>
            )}

            {readyToGenerateBill && !requestingBill && (
              <Button
                size="lg"
                className="h-12 w-full gap-2 bg-[#007bff] text-white hover:bg-[#0069d9]"
                onClick={() => session && requestBill(session.id)}
              >
                <ReceiptText className="size-4.5" /> Generate Final Bill
              </Button>
            )}

            {requestingBill && !hasUnsentItems && (
              <div className="rounded-2xl border bg-card px-4 py-8 flex flex-col items-center gap-2 text-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Generating your final bill…</p>
              </div>
            )}

            {billRequestFailed && !hasUnsentItems && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-destructive">Couldn&apos;t generate the final bill.</p>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={retryGenerateBill}>
                  <RefreshCw className="size-3.5" /> Try again
                </Button>
              </div>
            )}

            {showPaymentSection && (
              <>
                {invoicePaymentStatus === "Paid" ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-400 text-center">
                    Payment received — thank you!
                  </div>
                ) : paymentIntent === "cash_pending" ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-4 flex flex-col items-center gap-2 text-center">
                    <Loader2 className="size-5 animate-spin text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Waiting for Restaurant/Admin Approval.</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                      Let the staff know you&apos;re paying by cash — they&apos;ll confirm it here.
                    </p>
                  </div>
                ) : paymentIntent === "upi_confirm" ? (
                  <div className="rounded-xl border bg-card px-4 py-4 flex flex-col items-center gap-3 text-center">
                    <p className="text-sm font-medium">Have you completed the payment?</p>
                    <div className="flex w-full gap-2">
                      <Button className="h-10 flex-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleConfirmUpiPaid}>
                        I&apos;ve Paid
                      </Button>
                      <Button variant="outline" className="h-10 flex-1" onClick={handleUpiPaymentFailed}>
                        Failed / Cancelled
                      </Button>
                    </div>
                  </div>
                ) : paymentIntent === "upi_pending" ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-4 flex flex-col items-center gap-2 text-center">
                    <Loader2 className="size-5 animate-spin text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Payment Pending</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">Waiting for the restaurant to confirm your payment.</p>
                  </div>
                ) : (
                  <PaymentOptions
                    shop={shop}
                    grandTotal={finalInvoiceBill.grandTotal}
                    upiQrDataUrl={upiQrDataUrl}
                    onPayViaUpi={handlePayViaUpi}
                    onPayCash={handleCashPayment}
                  />
                )}

                <div className="flex gap-2">
                  {invoicePaymentStatus === "Paid" && (
                    <>
                      <Button variant="outline" className="h-11 flex-1 gap-1.5" disabled={downloadingInvoicePdf} onClick={handleDownloadInvoicePdf}>
                        <Download className="size-4" /> {downloadingInvoicePdf ? "Generating…" : "Download"}
                      </Button>
                      <Button variant="outline" className="h-11 flex-1 gap-1.5" onClick={() => window.print()}>
                        <Printer className="size-4" /> Print
                      </Button>
                    </>
                  )}
                  <Button variant="outline" className="h-11 flex-1 gap-1.5" disabled={sharingInvoice} onClick={handleShareInvoice}>
                    <Share2 className="size-4" /> {sharingInvoice ? "Sharing…" : "Share"}
                  </Button>
                </div>
              </>
            )}

            {invoicePaymentStatus === "Unpaid" && (
              <Button
                size="lg"
                variant="secondary"
                className="h-12 w-full gap-2 text-muted-foreground"
                render={<Link href={menuUrl} />}
                nativeButton={false}
              >
                <Plus className="size-4" /> Add More Items
              </Button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
