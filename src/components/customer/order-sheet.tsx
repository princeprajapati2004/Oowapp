"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Trash2,
  ArrowLeft,
  ShoppingBag,
  Download,
  CircleCheck,
  MapPinned,
  History,
  Table2,
  ReceiptText,
  Plus,
  Share2,
  Printer,
  Phone,
  Clock,
  User,
  Banknote,
  QrCode as QrCodeIcon,
  Loader2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QtyStepper } from "@/components/shared/qty-stepper";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { PhoneVerification } from "@/components/customer/phone-verification";
import { ItemStatusBadge, sessionItemStatus } from "@/components/customer/item-status-badge";
import { formatCurrency } from "@/lib/utils/currency";
import { generateInvoicePdf } from "@/lib/utils/invoice-pdf";
import { calculateBill, mergeLineItems } from "@/lib/services/billing";
import {
  buildOrderMessage,
  buildIncrementalOrderMessage,
  buildWhatsAppUrl,
  generateBillNumber,
} from "@/lib/services/whatsapp";
import { buildCheckoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { api, ApiError } from "@/lib/api-client";
import { addStoredOrder } from "@/lib/order-history-storage";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { cn } from "@/lib/utils";
import type { CartItem } from "@/lib/hooks/use-cart";
import type { ActiveSession, CustomerShop, CustomerTax } from "@/lib/types/customer";

type Step = "cart" | "checkout" | "bill" | "invoice" | "placed";

// No official brand glyph ships in lucide-react — a small inline SVG avoids
// pulling in a whole icon-pack dependency just for this one button.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11a16.5 16.5 0 0 1-1.62-.6c-2.85-1.23-4.7-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.93s.73-2.08.99-2.36c.26-.28.56-.35.75-.35h.53c.17 0 .4-.03.62.47.24.55.8 1.9.87 2.04.07.14.11.3.02.49-.09.19-.14.3-.28.46-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.28.36-.23.6-.14.24.09 1.55.73 1.81.86.26.14.44.2.5.32.06.12.06.68-.18 1.36Z" />
    </svg>
  );
}

/** Shared between the pre-order "Review your bill" step and the post-session
 * "Final Bill" invoice step — extracted to avoid duplicating this block twice. */
function PaymentInfo({ shop }: { shop: CustomerShop }) {
  if (!shop.upiId && !shop.paymentQrImageUrl && !shop.acceptCash && !shop.bankAccountNumber) return null;
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b">
        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">How to pay</p>
      </div>
      <div className="px-4 py-3 space-y-3 text-sm">
        {shop.paymentQrImageUrl && (
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl border-2 border-border bg-white p-3">
              <Image
                src={shop.paymentQrImageUrl}
                alt="Payment QR"
                width={160}
                height={160}
                unoptimized
                className="rounded-lg"
              />
            </div>
            {shop.upiId && (
              <p className="text-center text-xs text-muted-foreground">
                Scan or pay to <span className="font-semibold text-foreground">{shop.upiId}</span>
              </p>
            )}
          </div>
        )}
        {!shop.paymentQrImageUrl && shop.upiId && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">UPI ID</span>
            <span className="font-semibold">{shop.upiId}</span>
          </div>
        )}
        {shop.bankAccountNumber && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-0.5">
            <p className="font-medium text-foreground">Bank transfer</p>
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
      </div>
    </div>
  );
}

export function OrderSheet({
  open,
  onOpenChange,
  items,
  onSetQuantity,
  onRemove,
  onOrderPlaced,
  shop,
  taxes,
  prefilledTable,
  customer,
  activeSession,
  verifiedPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onOrderPlaced: () => void;
  shop: CustomerShop;
  taxes: CustomerTax[];
  prefilledTable?: string;
  customer?: { name: string; phone: string } | null;
  activeSession?: ActiveSession;
  verifiedPhone?: string | null;
}) {
  const [step, setStep] = useState<Step>("cart");
  const [checkoutValues, setCheckoutValues] = useState<CheckoutInput | null>(null);
  const [billNumber, setBillNumber] = useState<string>("");
  const [clientRequestId, setClientRequestId] = useState<string>("");
  const [placing, setPlacing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [generatingBill, setGeneratingBill] = useState(false);
  const [downloadingInvoicePdf, setDownloadingInvoicePdf] = useState(false);
  const [sharingInvoice, setSharingInvoice] = useState(false);
  // Which payment method the customer is mid-flow on for the Final Bill screen —
  // purely a local, ephemeral UI state (not persisted): staff still make the
  // real call via their existing "Mark as Paid" action, this just reflects
  // what the customer told us they're doing while we wait on that.
  const [paymentIntent, setPaymentIntent] = useState<"idle" | "cash_pending" | "upi_confirm" | "upi_pending">("idle");
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string | null>(null);
  // null = still waiting on the persistence call; a string once it resolves
  // with an orderId; false if the shop doesn't save orders (nothing to track).
  const [placedOrderId, setPlacedOrderId] = useState<string | null | false>(null);
  // Local copy of the table session, kept in sync from the POST /api/orders
  // response after each placed order — the server prop is only fresh as of
  // page load, so a second order placed in the same sitting (no reload)
  // needs this to correctly treat itself as incremental.
  const [session, setSession] = useState<ActiveSession>(activeSession ?? null);

  // Reset to the cart step whenever the sheet transitions from closed to open.
  // Adjusting state during render (rather than in an effect) avoids an extra render pass —
  // see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("cart");
      setPlacedOrderId(null);
      setPaymentIntent("idle");
    }
  }

  const schema = useMemo(
    () =>
      buildCheckoutSchema({
        requireCustomerName: shop.requireCustomerName,
        requirePhone: shop.requirePhone,
        // Customers never type a table number themselves (see the read-only
        // table display below) — nothing to require here.
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
  // A logged-in Customer account is already a stronger guarantee than phone
  // OTP, and a phone that matches an existing OTP-verified cookie doesn't
  // need re-verifying this sitting — see phone-verification.tsx.
  const [phoneVerified, setPhoneVerified] = useState(
    !!customer || (!!verifiedPhone && verifiedPhone === phoneValue)
  );

  const bill = useMemo(
    () =>
      calculateBill(
        items.map((i) => ({
          id: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          categoryId: i.categoryId,
        })),
        taxes
      ),
    [items, taxes]
  );

  // Items already submitted for this table's active session — locked,
  // read-only, never merged into the editable cart. `items`/`bill` above
  // always represent only the new stuff being added this round.
  const alreadyOrderedItems = useMemo(() => {
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
          }))
        )
    );
  }, [session]);

  const isIncremental = alreadyOrderedItems.length > 0;

  const sessionRunningBill = useMemo(() => {
    if (!isIncremental) return null;
    const merged = mergeLineItems([
      ...alreadyOrderedItems,
      ...items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId })),
    ]);
    return calculateBill(merged, taxes);
  }, [isIncremental, alreadyOrderedItems, items, taxes]);

  const billAlreadyRequested = session?.status === "AWAITING_PAYMENT";

  // Keeps the final-bill screen live if staff mark the table as paid while the
  // customer still has it open — and clears the cart automatically at that
  // point, since a paid session can never accept more items (the next order
  // from this table always starts a brand-new session server-side).
  useOrderEvents(session ? `/api/table-sessions/${session.id}/stream` : "", {
    onSessionUpdated: (updated) => {
      setSession((prev) =>
        prev
          ? { ...prev, status: updated.status, billRequestedAt: updated.billRequestedAt, paymentMethod: updated.paymentMethod }
          : prev
      );
      if (updated.status === "PAID") {
        toast.success("Payment confirmed — thank you!");
        onOrderPlaced();
      }
    },
  });

  // "Generate Final Bill" reads from the already-submitted session/checkout
  // data rather than requiring the customer to re-enter their details — the
  // whole point is that this is a returning customer on an existing session.
  const invoiceNumber = session ? `INV-${session.id.slice(-8).toUpperCase()}` : "";
  const invoiceCustomerName = checkoutValues?.customerName || customer?.name || undefined;
  const invoiceCustomerPhone = checkoutValues?.customerPhone || customer?.phone || verifiedPhone || undefined;
  const invoiceTableNumber = checkoutValues?.tableNumber || prefilledTable || undefined;
  // Final Bill = every previously-placed round PLUS whatever's still sitting in
  // the cart this sitting, even if it hasn't been sent via WhatsApp yet.
  const finalInvoiceItems = useMemo(
    () =>
      mergeLineItems([
        ...alreadyOrderedItems,
        ...items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId })),
      ]),
    [alreadyOrderedItems, items]
  );
  const finalInvoiceBill = useMemo(() => calculateBill(finalInvoiceItems, taxes), [finalInvoiceItems, taxes]);
  const invoicePaymentStatus: "Paid" | "Unpaid" = session?.status === "PAID" ? "Paid" : "Unpaid";
  // Bill Status Flow: Bill Generated → Cash Approval Pending / Payment Pending → Paid (Cash) / Paid (Online).
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

  // Dynamic UPI QR — regenerates whenever the payable amount changes, so the
  // code always encodes the exact current total rather than a static image.
  useEffect(() => {
    if (!shop.upiId || invoicePaymentStatus === "Paid") {
      setUpiQrDataUrl(null);
      return;
    }
    const note = [invoiceTableNumber ? `Table ${invoiceTableNumber}` : null, invoiceNumber || null]
      .filter(Boolean)
      .join(" ") || shop.businessName;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.businessName)}&am=${finalInvoiceBill.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
    let cancelled = false;
    QRCode.toDataURL(upiUrl, { width: 220, margin: 1 }).then((url) => {
      if (!cancelled) setUpiQrDataUrl(url);
    }).catch(() => {
      if (!cancelled) setUpiQrDataUrl(null);
    });
    return () => {
      cancelled = true;
    };
  }, [shop.upiId, shop.businessName, finalInvoiceBill.grandTotal, invoiceTableNumber, invoiceNumber, invoicePaymentStatus]);

  function buildUpiUrl() {
    const note = [invoiceTableNumber ? `Table ${invoiceTableNumber}` : null, invoiceNumber || null]
      .filter(Boolean)
      .join(" ") || shop.businessName;
    return `upi://pay?pa=${encodeURIComponent(shop.upiId ?? "")}&pn=${encodeURIComponent(shop.businessName)}&am=${finalInvoiceBill.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
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

  async function handleGenerateFinalBill() {
    setGeneratingBill(true);
    try {
      // A brand-new customer with no session yet has nothing to notify staff
      // about — just show the bill straight from the current cart.
      if (session) {
        const res = await api.patch<{ ok: boolean; session: { status: string; billRequestedAt: string | null } }>(
          `/api/table-sessions/${session.id}`,
          { action: "request_bill" }
        );
        setSession((prev) => (prev ? { ...prev, status: res.session.status, billRequestedAt: res.session.billRequestedAt } : prev));
      }
      setStep("invoice");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Another device on the same table just requested it — show the invoice anyway.
        setSession((prev) => (prev ? { ...prev, status: "AWAITING_PAYMENT" } : prev));
        setStep("invoice");
      } else {
        toast.error("Couldn't generate the final bill — please try again.");
      }
    } finally {
      setGeneratingBill(false);
    }
  }

  async function handleDownloadInvoicePdf() {
    setDownloadingInvoicePdf(true);
    try {
      await generateInvoicePdf({
        shop,
        billNumber: invoiceNumber || "PREVIEW",
        invoiceNumber,
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
    const label = invoiceNumber || "Final Bill";
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

  function handleGenerateBill(values: CheckoutInput) {
    if (shop.requirePhone && !phoneVerified) {
      toast.error("Please verify your phone number before continuing.");
      return;
    }
    setCheckoutValues({
      ...values,
      tableNumber: shop.enableTableNumber
        ? (values.tableNumber || prefilledTable || "")
        : "",
    });
    setBillNumber(generateBillNumber(shop.slug));
    setClientRequestId(crypto.randomUUID());
    setStep("bill");
  }

  async function handlePlaceOrder() {
    if (!checkoutValues || billAlreadyRequested) return;
    setPlacing(true);

    const message =
      isIncremental && sessionRunningBill
        ? buildIncrementalOrderMessage({
            tableNumber: checkoutValues.tableNumber || "",
            roundNumber: (session?.orders.length ?? 0) + 1,
            deltaItems: items,
            deltaBill: bill,
            sessionBill: sessionRunningBill,
            currency: shop.currency,
            notes: checkoutValues.notes || undefined,
          })
        : buildOrderMessage({
            customerName: checkoutValues.customerName || undefined,
            customerPhone: checkoutValues.customerPhone || undefined,
            tableNumber: checkoutValues.tableNumber || undefined,
            deliveryAddress: checkoutValues.deliveryAddress || undefined,
            notes: checkoutValues.notes || undefined,
            items,
            bill,
            currency: shop.currency,
          });
    const url = buildWhatsAppUrl(shop.whatsappNumber, message);

    // The WhatsApp handoff never waits on this — it still fires immediately
    // below regardless of how (or whether) persistence resolves. The result
    // only controls whether a "Track your order" link appears afterward.
    api
      .post<{
        ok: boolean;
        saved: boolean;
        orderId?: string;
        tableSessionId?: string | null;
        sessionStatus?: string | null;
        sessionOrders?: { status: string; items: { productId: string | null; name: string; price: number; quantity: number; categoryId?: string }[] }[];
      }>("/api/orders", {
        shopSlug: shop.slug,
        billNumber,
        clientRequestId,
        customerName: checkoutValues.customerName,
        customerPhone: checkoutValues.customerPhone,
        tableNumber: checkoutValues.tableNumber,
        deliveryAddress: checkoutValues.deliveryAddress,
        notes: checkoutValues.notes,
        items,
      })
      .then((res) => {
        const id = res.saved && res.orderId ? res.orderId : false;
        setPlacedOrderId(id);
        if (id) addStoredOrder(shop.slug, { orderId: id, billNumber, placedAt: new Date().toISOString() });
        if (res.tableSessionId && res.sessionOrders) {
          setSession({ id: res.tableSessionId, status: res.sessionStatus ?? "ACTIVE", orders: res.sessionOrders });
        }
      })
      .catch((err) => {
        setPlacedOrderId(false);
        if (err instanceof ApiError && err.status === 409) {
          toast.error("Bill was just requested for this table — please check with staff before ordering more.");
          setSession((prev) => (prev ? { ...prev, status: "AWAITING_PAYMENT" } : prev));
        }
      });

    onOrderPlaced();
    setPlacing(false);
    setStep("placed");
    // Open WhatsApp in a new tab so the customer stays on the menu page.
    // On mobile the OS intercepts the wa.me URL and opens the WhatsApp app directly
    // without any visible tab switch.
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleDownloadPdf() {
    if (!checkoutValues) return;
    setDownloadingPdf(true);
    try {
      await generateInvoicePdf({
        shop,
        billNumber,
        customerName: checkoutValues.customerName,
        customerPhone: checkoutValues.customerPhone,
        tableNumber: checkoutValues.tableNumber,
        deliveryAddress: checkoutValues.deliveryAddress,
        notes: checkoutValues.notes,
        items,
        bill,
      });
    } catch {
      toast.error("Couldn't generate the PDF — please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[92vh] max-w-lg flex-col overflow-hidden rounded-t-2xl p-0 gap-0"
      >
        {step === "cart" && (
          <>
            <SheetHeader className="px-5 pt-5 pb-0">
              <SheetTitle className="text-lg">Your cart</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-2 pt-4">
              {alreadyOrderedItems.length > 0 && (
                <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Already Ordered
                    </p>
                    <ItemStatusBadge status={sessionItemStatus(session?.status ?? "ACTIVE")} />
                  </div>
                  {alreadyOrderedItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="truncate">{item.name} × {item.quantity}</span>
                      <span className="shrink-0">{formatCurrency(item.price * item.quantity, shop.currency)}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Already sent to the kitchen — add more below.
                  </p>
                </div>
              )}
              {items.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="Your cart is empty"
                  description="Add items from the menu to get started."
                />
              ) : (
                <>
                  {isIncremental && (
                    <div className="flex items-center justify-between gap-2 px-0.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        New Items
                      </p>
                      <ItemStatusBadge status="new" />
                    </div>
                  )}
                  {items.map((item) => (
                    <div key={item.productId} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatCurrency(item.price, shop.currency)} × {item.quantity} = {formatCurrency(item.price * item.quantity, shop.currency)}
                        </p>
                      </div>
                      <QtyStepper
                        size="sm"
                        value={item.quantity}
                        onChange={(q) => onSetQuantity(item.productId, q)}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemove(item.productId)}
                        aria-label="Remove"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
            {(items.length > 0 || isIncremental) && (
              <div className="border-t bg-background px-5 py-4 space-y-3">
                {items.length > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal ({items.length} item{items.length !== 1 ? "s" : ""})</span>
                    <span className="font-semibold">{formatCurrency(bill.subtotal, shop.currency)}</span>
                  </div>
                )}
                <div className="space-y-2">
                  {items.length > 0 && (
                    <Button
                      size="lg"
                      className="h-12 w-full gap-2 bg-[#25D366] text-white hover:bg-[#1ea952] shadow-sm shadow-[#25D366]/20"
                      onClick={() => setStep("checkout")}
                    >
                      <WhatsAppIcon className="size-4.5" /> Place Order on WhatsApp
                    </Button>
                  )}
                  <Button
                    size="lg"
                    className="h-12 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20"
                    disabled={generatingBill}
                    onClick={billAlreadyRequested ? () => setStep("invoice") : handleGenerateFinalBill}
                  >
                    <ReceiptText className="size-4.5" />
                    {generatingBill ? "Generating…" : billAlreadyRequested ? "View Final Bill" : "Generate Final Bill"}
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-11 w-full gap-2 text-muted-foreground"
                    onClick={() => onOpenChange(false)}
                  >
                    <Plus className="size-4" /> Add More Items
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {step === "checkout" && (
          <>
            <SheetHeader className="px-5 pt-4 pb-0">
              <button
                type="button"
                onClick={() => setStep("cart")}
                className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" /> Back to cart
              </button>
              <SheetTitle className="text-lg">Your details</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit(handleGenerateBill)} className="flex-1 overflow-y-auto px-5 pb-4 space-y-5 pt-4">
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
                <FormRow
                  label="Delivery address"
                  htmlFor="deliveryAddress"
                  required
                  error={errors.deliveryAddress}
                >
                  <Textarea id="deliveryAddress" rows={2} placeholder="Your full address" {...register("deliveryAddress")} />
                </FormRow>
              )}
              {shop.allowNotes && (
                <FormRow label="Special instructions" htmlFor="notes" description="Optional">
                  <Textarea id="notes" rows={2} placeholder="Allergies, preferences…" {...register("notes")} />
                </FormRow>
              )}

              <Button
                type="submit"
                size="lg"
                className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
              >
                Review Your Order
              </Button>
            </form>
          </>
        )}

        {step === "bill" && checkoutValues && (
          <>
            <SheetHeader className="px-5 pt-4 pb-0">
              <button
                type="button"
                onClick={() => setStep("checkout")}
                className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <SheetTitle className="text-lg">Review your bill</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4 pt-4">
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-4 text-center border-b bg-muted/30">
                  {shop.logoUrl ? (
                    <Image
                      src={shop.logoUrl}
                      alt={shop.businessName}
                      width={44}
                      height={44}
                      unoptimized
                      className="mx-auto mb-2 rounded-full object-cover ring-2 ring-border"
                    />
                  ) : null}
                  <p className="font-bold text-base">{shop.businessName}</p>
                  {shop.address ? <p className="text-xs text-muted-foreground mt-0.5">{shop.address}</p> : null}
                  {shop.phone ? <p className="text-xs text-muted-foreground">{shop.phone}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Bill #{billNumber}
                  </p>
                </div>

                <div className="px-4 py-3 space-y-2 border-b">
                  {items.map((item) => (
                    <div key={item.productId} className="flex items-start justify-between gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground ml-1">× {item.quantity}</span>
                      </div>
                      <span className="font-medium shrink-0">{formatCurrency(item.price * item.quantity, shop.currency)}</span>
                    </div>
                  ))}
                </div>

                <div className="px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(bill.subtotal, shop.currency)}</span>
                  </div>
                  {bill.taxLines.map((line) => (
                    <div key={line.id} className="flex justify-between text-muted-foreground">
                      <span>{line.name}</span>
                      <span>{formatCurrency(line.amount, shop.currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
                    <span>{isIncremental ? "This round" : "Grand total"}</span>
                    <span className="text-primary">{formatCurrency(bill.grandTotal, shop.currency)}</span>
                  </div>
                </div>
              </div>

              {isIncremental && sessionRunningBill && (
                <div className="rounded-xl border bg-primary/5 px-4 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium">Table running total</span>
                  <span className="font-bold text-primary">
                    {formatCurrency(sessionRunningBill.grandTotal, shop.currency)}
                  </span>
                </div>
              )}

              {billAlreadyRequested && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                  Bill already requested for this table — please check with staff before ordering more.
                </div>
              )}

              <PaymentInfo shop={shop} />

              {checkoutValues.notes && (
                <div className="rounded-xl border bg-card px-4 py-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                  <p className="text-muted-foreground">{checkoutValues.notes}</p>
                </div>
              )}
            </div>

            <div className="border-t bg-background px-5 py-4 space-y-2">
              <Button
                size="lg"
                className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
                disabled={placing || billAlreadyRequested}
                onClick={handlePlaceOrder}
              >
                {placing ? "Opening WhatsApp…" : "Place order via WhatsApp"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full gap-1.5 text-muted-foreground"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
              >
                <Download className="size-3.5" />
                {downloadingPdf ? "Generating PDF…" : "Download bill PDF"}
              </Button>
            </div>
          </>
        )}

        {step === "invoice" && (
          <>
            <SheetHeader className="px-5 pt-4 pb-0">
              <button
                type="button"
                onClick={() => setStep("cart")}
                className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" /> Back to cart
              </button>
              <SheetTitle className="text-lg">Final Bill</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4 pt-4">
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-4 text-center border-b bg-muted/30">
                  {shop.logoUrl ? (
                    <Image
                      src={shop.logoUrl}
                      alt={shop.businessName}
                      width={44}
                      height={44}
                      unoptimized
                      className="mx-auto mb-2 rounded-full object-cover ring-2 ring-border"
                    />
                  ) : null}
                  <p className="font-bold text-base">{shop.businessName}</p>
                  {shop.address ? <p className="text-xs text-muted-foreground mt-0.5">{shop.address}</p> : null}
                  {shop.phone ? <p className="text-xs text-muted-foreground">{shop.phone}</p> : null}
                  {invoiceNumber && <p className="mt-2 text-xs text-muted-foreground font-mono">{invoiceNumber}</p>}
                </div>

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
                  {invoiceTableNumber && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Table2 className="size-3.5 shrink-0" />
                      <span>Table {invoiceTableNumber}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" />
                    <span>
                      {new Date(session?.billRequestedAt ?? Date.now()).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-2 border-b">
                  {finalInvoiceItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground ml-1">× {item.quantity}</span>
                      </div>
                      <span className="font-medium shrink-0">{formatCurrency(item.price * item.quantity, shop.currency)}</span>
                    </div>
                  ))}
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

                <div className="px-4 py-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Bill Status</span>
                  <span
                    className={cn(
                      "font-semibold",
                      invoicePaymentStatus === "Paid" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {billStatusLabel}
                  </span>
                </div>
              </div>

              {invoicePaymentStatus === "Paid" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-400 text-center">
                  Payment received — thank you!
                </div>
              ) : paymentIntent === "cash_pending" ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-4 flex flex-col items-center gap-2 text-center">
                  <Loader2 className="size-5 animate-spin text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                    Waiting for Restaurant/Admin Approval.
                  </p>
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
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                    Waiting for the restaurant to confirm your payment.
                  </p>
                </div>
              ) : (
                <>
                  {upiQrDataUrl && (
                    <div className="rounded-xl border bg-card overflow-hidden">
                      <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
                        <QrCodeIcon className="size-3.5 text-muted-foreground" />
                        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Scan to pay via UPI</p>
                      </div>
                      <div className="px-4 py-4 flex flex-col items-center gap-2">
                        <div className="rounded-2xl border-2 border-border bg-white p-3">
                          {/* Data-URL, not a remote image — next/image would add no benefit here. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={upiQrDataUrl} alt="UPI payment QR code" width={180} height={180} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Pay <span className="font-semibold text-foreground">{formatCurrency(finalInvoiceBill.grandTotal, shop.currency)}</span> to{" "}
                          <span className="font-semibold text-foreground">{shop.upiId}</span>
                        </p>
                      </div>
                    </div>
                  )}
                  {shop.bankAccountNumber && (
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                      <p className="font-medium text-foreground">Bank transfer</p>
                      {shop.bankName && <p className="text-muted-foreground">{shop.bankName}</p>}
                      <p className="text-muted-foreground">A/C: {shop.bankAccountNumber}</p>
                      {shop.bankIfsc && <p className="text-muted-foreground">IFSC: {shop.bankIfsc}</p>}
                    </div>
                  )}
                  {(shop.acceptCash || shop.upiId) && (
                    <div className="space-y-2">
                      {shop.acceptCash && (
                        <Button
                          size="lg"
                          className="h-11 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={handleCashPayment}
                        >
                          <Banknote className="size-4" /> Cash Payment
                        </Button>
                      )}
                      {shop.upiId && (
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-11 w-full gap-2"
                          onClick={handlePayViaUpi}
                        >
                          <QrCodeIcon className="size-4" /> Pay via GPay / UPI
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t bg-background px-5 py-4 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-11 flex-1 gap-1.5"
                  disabled={downloadingInvoicePdf}
                  onClick={handleDownloadInvoicePdf}
                >
                  <Download className="size-4" /> {downloadingInvoicePdf ? "Generating…" : "Download"}
                </Button>
                <Button variant="outline" className="h-11 flex-1 gap-1.5" onClick={() => window.print()}>
                  <Printer className="size-4" /> Print
                </Button>
                <Button variant="outline" className="h-11 flex-1 gap-1.5" disabled={sharingInvoice} onClick={handleShareInvoice}>
                  <Share2 className="size-4" /> {sharingInvoice ? "Sharing…" : "Share"}
                </Button>
              </div>
              {invoicePaymentStatus === "Unpaid" && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 w-full gap-2 text-muted-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  <Plus className="size-4" /> Add More Items
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-9 w-full text-muted-foreground" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}

        {step === "placed" && (
          <>
            <SheetHeader className="px-5 pt-5 pb-0">
              <SheetTitle className="text-lg">Order placed!</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 pb-2 pt-4">
              <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-8 text-center">
                <CircleCheck className="size-12 text-emerald-500" />
                <div>
                  <p className="font-semibold">Sent to {shop.businessName} via WhatsApp</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Bill #{billNumber}</p>
                </div>

                {placedOrderId === null && (
                  <p className="text-xs text-muted-foreground">Setting up live order tracking…</p>
                )}

                {typeof placedOrderId === "string" && (
                  <Button
                    size="lg"
                    className="h-11 w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                    render={
                      <Link
                        href={`/order/${shop.slug}/track/${placedOrderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    <MapPinned className="size-4" /> Track your order live
                  </Button>
                )}
              </div>
            </div>
            <div className="border-t bg-background px-5 py-4 space-y-2">
              <Button variant="outline" size="lg" className="h-11 w-full" onClick={() => onOpenChange(false)}>
                Continue browsing
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-full gap-1.5 text-muted-foreground"
                render={<Link href={`/order/${shop.slug}/orders`} />}
                nativeButton={false}
              >
                <History className="size-3.5" /> View my orders
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
