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
  Loader2,
  RefreshCw,
  ImageOff,
  Lock,
  ChefHat,
  ShoppingBag,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PhoneVerification } from "@/components/customer/phone-verification";
import { PaymentOptions } from "@/components/customer/payment-options";
import { ItemStatusBadge, sessionItemStatus } from "@/components/customer/item-status-badge";
import { tableSessionKey } from "@/components/customer/customer-menu";
import { formatCurrency } from "@/lib/utils/currency";
import { generateInvoicePdf } from "@/lib/utils/invoice-pdf";
import { calculateBill, mergeLineItems, type BillLineItem } from "@/lib/services/billing";
import { buildOrderMessage, buildIncrementalOrderMessage, buildWhatsAppUrl } from "@/lib/services/whatsapp";
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

// ── WhatsApp order confirmation ───────────────────────────────────────────────
// Shown after the customer taps "Place Order on WhatsApp" in table-less mode,
// replacing the "Nothing ordered yet" empty state while the session hasn't
// been created yet (the async API call hasn't resolved, or there's no table).
type WhatsAppSnapshot = {
  items: { productId: string; name: string; price: number; quantity: number; imageUrl?: string | null }[];
  subtotal: number;
  grandTotal: number;
  taxLines: { id: string; name: string; amount: number }[];
  customerName?: string;
  discount?: { code: string; amount: number };
  walletRedeemed?: number;
};

function WhatsAppOrderSent({
  snapshot,
  shop,
  menuUrl,
}: {
  snapshot: WhatsAppSnapshot;
  shop: CustomerShop;
  menuUrl: string;
}) {
  const whatsappHelpUrl = shop.whatsappNumber
    ? `https://wa.me/${shop.whatsappNumber.replace(/\D/g, "")}`
    : null;
  const phoneUrl = shop.phone ? `tel:${shop.phone}` : null;

  return (
    <div className="space-y-4">
      {/* Confirmation banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-6 flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-800/40">
          <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="space-y-1">
          <p className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Order Request Sent</p>
          <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">
            {snapshot.customerName
              ? `Thank you, ${snapshot.customerName}!`
              : "Thank you!"}
          </p>
        </div>
        <p className="text-sm text-emerald-700/80 dark:text-emerald-300/70 max-w-xs">
          Your order request has been sent. It will be confirmed shortly.
        </p>
      </div>

      {/* Order summary */}
      <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order Summary</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          {snapshot.items.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 text-sm">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.name} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <ImageOff className="size-3.5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground ml-1">× {item.quantity}</span>
              </div>
              <span className="font-medium shrink-0">
                {formatCurrency(item.price * item.quantity, shop.currency)}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 space-y-1.5 text-sm border-t">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(snapshot.subtotal, shop.currency)}</span>
          </div>
          {snapshot.taxLines.map((line) => (
            <div key={line.id} className="flex justify-between text-muted-foreground">
              <span>{line.name}</span>
              <span>{formatCurrency(line.amount, shop.currency)}</span>
            </div>
          ))}
          {snapshot.discount && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Coupon — {snapshot.discount.code}</span>
              <span>−{formatCurrency(snapshot.discount.amount, shop.currency)}</span>
            </div>
          )}
          {!!snapshot.walletRedeemed && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Wallet credit</span>
              <span>−{formatCurrency(snapshot.walletRedeemed, shop.currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
            <span>Grand Total</span>
            <span className="text-primary">
              {formatCurrency(
                Math.max(
                  0,
                  Math.round(
                    (snapshot.grandTotal - (snapshot.discount?.amount ?? 0) - (snapshot.walletRedeemed ?? 0)) * 100
                  ) / 100
                ),
                shop.currency
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Help section */}
      {(phoneUrl || whatsappHelpUrl) && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-center text-muted-foreground">Need Help?</p>
          <div className="flex gap-2">
            {phoneUrl && (
              <a
                href={phoneUrl}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.98]"
              >
                <Phone className="size-4 text-muted-foreground" />
                Call Store
              </a>
            )}
            {whatsappHelpUrl && (
              <a
                href={whatsappHelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-[#25D366]/10 px-3 py-2.5 text-sm font-medium text-[#128C7E] dark:text-[#25D366] transition-colors hover:bg-[#25D366]/20 active:scale-[0.98]"
              >
                <MessageCircle className="size-4" />
                WhatsApp Store
              </a>
            )}
          </div>
        </div>
      )}

      {/* Add more items */}
      <Button
        size="lg"
        variant="outline"
        className="h-12 w-full gap-2"
        render={<Link href={menuUrl} />}
        nativeButton={false}
      >
        <Plus className="size-4" /> Add More Items
      </Button>
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
  customer?: { id: string; name: string; phone: string; walletBalance: number } | null;
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
  const [whatsappOrderSnapshot, setWhatsappOrderSnapshot] = useState<WhatsAppSnapshot | null>(null);
  // No payment-gateway integration behind any of this — these are just local
  // UI states while the customer waits for staff to verify the payment and
  // mark the table paid from the admin side (see admin/table-sessions PATCH
  // mark_paid). There is no customer self-confirm step.
  const [paymentIntent, setPaymentIntent] = useState<"idle" | "cash_pending" | "upi_confirm" | "upi_pending">("idle");
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string | null>(null);
  const [checkoutValues, setCheckoutValues] = useState<CheckoutInput | null>(null);
  const [directOrderPlaced, setDirectOrderPlaced] = useState(false);

  const menuUrl = `/order/${shop.slug}${prefilledTable ? `?table=${encodeURIComponent(prefilledTable)}` : ""}`;

  useTableSession(
    session,
    setSession,
    () => {
      toast.success("Payment confirmed — thank you!");
      cart.clear();
    },
    () => {
      setPaymentIntent("idle");
      toast.error("The restaurant couldn't confirm your payment — please try again.");
    }
  );

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

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    description: string | null;
  } | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [useWalletCredit, setUseWalletCredit] = useState(false);

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
  const finalTotalAfterCoupon = appliedCoupon
    ? Math.max(0, Math.round((finalInvoiceBill.grandTotal - appliedCoupon.discountAmount) * 100) / 100)
    : finalInvoiceBill.grandTotal;

  // Wallet redemption only offered for a standalone/first-round order — once
  // there are already-ordered items (a 2nd+ round on an active table
  // session), Order.paidAmount is per-order, not per-session, so redeeming
  // against the whole running total here would misattribute how much of
  // THIS order's total is actually covered. Kept simple rather than teaching
  // the redemption math about table-session partial payments.
  const walletEligible = !isIncremental && !!customer && customer.walletBalance > 0;
  const walletAmountToUse =
    walletEligible && useWalletCredit ? Math.min(customer!.walletBalance, finalTotalAfterCoupon) : 0;

  // A coupon's discount was computed against the cart contents at the moment
  // it was applied — if the cart changes afterward, that number may no
  // longer be right (a different subtotal, or category-restricted items
  // removed). Clearing it forces a fresh "Apply" rather than showing a
  // stale/wrong discount; the server recomputes from scratch regardless, but
  // the displayed total should never lie.
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError(null);
    setUseWalletCredit(false);
  }, [bill.subtotal]);

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponError(null);
    setCouponApplying(true);
    try {
      const res = await api.post<{
        ok: boolean;
        code: string;
        discountAmount: number;
        description: string | null;
      }>("/api/coupons/validate", {
        shopSlug: shop.slug,
        code: couponCode.trim(),
        items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      setAppliedCoupon({ code: res.code, discountAmount: res.discountAmount, description: res.description });
      toast.success(`Coupon ${res.code} applied`);
    } catch (err) {
      setCouponError(err instanceof ApiError ? err.message : "Couldn't apply this coupon — try again.");
    } finally {
      setCouponApplying(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

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
    toast.success("Waiting for approval. Staff will collect payment shortly.");
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
    if (shop.requirePhoneVerification && !phoneVerified) {
      toast.error("Please verify your phone number before continuing.");
      return;
    }

    const resolvedValues: CheckoutInput = {
      ...values,
      tableNumber: shop.enableTableNumber ? (values.tableNumber || prefilledTable || "") : "",
    };
    const newClientRequestId = crypto.randomUUID();
    setCheckoutValues(resolvedValues);
    setPlacing(true);

    if (shop.orderMode === "DIRECT") {
      try {
        const res = await api.post<{
          ok: boolean;
          saved: boolean;
          orderId?: string;
          billNumber?: string;
          tableSessionId?: string | null;
          sessionStatus?: string | null;
          sessionOrders?: { status: string; items: { productId: string | null; name: string; price: number; quantity: number; categoryId?: string; imageUrl?: string | null }[] }[];
        }>("/api/orders", {
          shopSlug: shop.slug,
          clientRequestId: newClientRequestId,
          customerName: resolvedValues.customerName,
          customerPhone: resolvedValues.customerPhone,
          tableNumber: resolvedValues.tableNumber,
          deliveryAddress: resolvedValues.deliveryAddress,
          notes: resolvedValues.notes,
          items: cart.items,
          couponCode: appliedCoupon?.code,
          walletAmountUsed: walletAmountToUse > 0 ? walletAmountToUse : undefined,
        });
        if (res.orderId && res.billNumber) {
          addStoredOrder(shop.slug, { orderId: res.orderId, billNumber: res.billNumber, placedAt: new Date().toISOString() });
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
        removeCoupon();
        setUseWalletCredit(false);
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
    // Capture snapshot now so that if this is a table-less order the confirmation
    // screen can render even after the cart is cleared by the async API response.
    setWhatsappOrderSnapshot({
      items: cart.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        imageUrl: i.imageUrl,
      })),
      subtotal: bill.subtotal,
      grandTotal: bill.grandTotal,
      taxLines: bill.taxLines,
      customerName: resolvedValues.customerName || undefined,
      discount: appliedCoupon ? { code: appliedCoupon.code, amount: appliedCoupon.discountAmount } : undefined,
      walletRedeemed: walletAmountToUse > 0 ? walletAmountToUse : undefined,
    });

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
            discount: appliedCoupon
              ? { label: `Coupon (${appliedCoupon.code})`, amount: appliedCoupon.discountAmount }
              : undefined,
            walletRedeemed: walletAmountToUse > 0 ? walletAmountToUse : undefined,
          });
    const url = buildWhatsAppUrl(shop.whatsappNumber, message);

    api
      .post<{
        ok: boolean;
        saved: boolean;
        orderId?: string;
        billNumber?: string;
        tableSessionId?: string | null;
        sessionStatus?: string | null;
        sessionOrders?: {
          status: string;
          items: { productId: string | null; name: string; price: number; quantity: number; categoryId?: string; imageUrl?: string | null }[];
        }[];
      }>("/api/orders", {
        shopSlug: shop.slug,
        clientRequestId: newClientRequestId,
        customerName: resolvedValues.customerName,
        customerPhone: resolvedValues.customerPhone,
        tableNumber: resolvedValues.tableNumber,
        deliveryAddress: resolvedValues.deliveryAddress,
        notes: resolvedValues.notes,
        items: cart.items,
        couponCode: !isIncremental ? appliedCoupon?.code : undefined,
        walletAmountUsed: walletAmountToUse > 0 ? walletAmountToUse : undefined,
      })
      .then((res) => {
        if (res.saved && res.orderId && res.billNumber) {
          addStoredOrder(shop.slug, { orderId: res.orderId, billNumber: res.billNumber, placedAt: new Date().toISOString() });
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
        removeCoupon();
        setUseWalletCredit(false);
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
          whatsappOrderSnapshot ? (
            <WhatsAppOrderSent snapshot={whatsappOrderSnapshot} shop={shop} menuUrl={menuUrl} />
          ) : (
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
          )
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
                {appliedCoupon && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Coupon — {appliedCoupon.code}</span>
                    <span>−{formatCurrency(appliedCoupon.discountAmount, shop.currency)}</span>
                  </div>
                )}
                {walletAmountToUse > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Wallet credit</span>
                    <span>−{formatCurrency(walletAmountToUse, shop.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
                  <span>Grand Total</span>
                  <span className="text-primary">
                    {formatCurrency(Math.max(0, finalTotalAfterCoupon - walletAmountToUse), shop.currency)}
                  </span>
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
                    shop.requirePhoneVerification ? (
                      <PhoneVerification
                        shopSlug={shop.slug}
                        phone={phoneValue}
                        onPhoneChange={(value) => setValue("customerPhone", value, { shouldValidate: true })}
                        verified={phoneVerified}
                        onVerifiedChange={setPhoneVerified}
                        error={errors.customerPhone?.message}
                      />
                    ) : (
                      <FormRow label="Phone number" htmlFor="customerPhone" required error={errors.customerPhone}>
                        <Input
                          id="customerPhone"
                          inputMode="numeric"
                          placeholder="Your phone number"
                          {...register("customerPhone")}
                        />
                      </FormRow>
                    )
                  )}
                  <FormRow label="Have a coupon?" htmlFor="couponCode">
                    {appliedCoupon ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm animate-in fade-in zoom-in-95 duration-200 dark:border-emerald-800 dark:bg-emerald-900/20">
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-semibold">{appliedCoupon.code}</span>
                        <span className="text-xs text-emerald-700 dark:text-emerald-400">Applied</span>
                        <button
                          type="button"
                          className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          onClick={removeCoupon}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          id="couponCode"
                          placeholder="Enter code"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          disabled={couponApplying || !couponCode.trim()}
                          onClick={applyCoupon}
                        >
                          {couponApplying ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                        </Button>
                      </div>
                    )}
                    {couponError && <p className="text-sm text-destructive mt-1.5">{couponError}</p>}
                  </FormRow>
                  {walletEligible && (
                    <label className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm cursor-pointer transition-colors hover:bg-muted/40">
                      <Checkbox checked={useWalletCredit} onCheckedChange={(v) => setUseWalletCredit(!!v)} />
                      <span className="flex-1">Use wallet balance</span>
                      <span className="font-semibold text-muted-foreground">
                        {formatCurrency(customer!.walletBalance, shop.currency)} available
                      </span>
                    </label>
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
                className="h-12 w-full gap-2"
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
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Waiting for staff approval.</p>
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
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">Waiting for the store to confirm your payment.</p>
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
