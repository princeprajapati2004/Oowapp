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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PhoneVerification } from "@/components/customer/phone-verification";
import { ItemStatusBadge, sessionItemStatus } from "@/components/customer/item-status-badge";
import { formatCurrency } from "@/lib/utils/currency";
import { generateInvoicePdf } from "@/lib/utils/invoice-pdf";
import { calculateBill, mergeLineItems } from "@/lib/services/billing";
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

export function FinalBillPage({
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
  const [paymentIntent, setPaymentIntent] = useState<"idle" | "cash_pending" | "upi_confirm" | "upi_pending">("idle");
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string | null>(null);
  const [checkoutValues, setCheckoutValues] = useState<CheckoutInput | null>(null);

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
        cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId })),
        taxes
      ),
    [cart.items, taxes]
  );

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
  const hasUnsentItems = cart.items.length > 0;

  const sessionRunningBill = useMemo(() => {
    if (!isIncremental) return null;
    const merged = mergeLineItems([
      ...alreadyOrderedItems,
      ...cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId })),
    ]);
    return calculateBill(merged, taxes);
  }, [isIncremental, alreadyOrderedItems, cart.items, taxes]);

  const billAlreadyRequested = session?.status === "AWAITING_PAYMENT";

  const invoiceNumber = session ? `INV-${session.id.slice(-8).toUpperCase()}` : "";
  const invoiceCustomerName = checkoutValues?.customerName || customer?.name || undefined;
  const invoiceCustomerPhone = checkoutValues?.customerPhone || customer?.phone || verifiedPhone || undefined;
  const invoiceTableNumber = checkoutValues?.tableNumber || prefilledTable || undefined;

  const finalInvoiceItems = useMemo(
    () =>
      mergeLineItems([
        ...alreadyOrderedItems,
        ...cart.items.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId })),
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

  // Landing on this page with everything already sent (no unsent items left)
  // implicitly finalizes the bill — no separate "Generate Final Bill" click
  // needed. Skipped while items are still unsent so the table doesn't get
  // locked for payment before the customer has actually sent everything.
  useEffect(() => {
    if (!cart.hydrated) return;
    if (!session || session.status !== "ACTIVE") return;
    if (hasUnsentItems) return;
    if (alreadyOrderedItems.length === 0) return;
    requestBill(session.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.hydrated, hasUnsentItems, session?.id, session?.status, alreadyOrderedItems.length]);

  useEffect(() => {
    if (!shop.upiId || invoicePaymentStatus === "Paid" || hasUnsentItems) {
      setUpiQrDataUrl(null);
      return;
    }
    const note = [invoiceTableNumber ? `Table ${invoiceTableNumber}` : null, invoiceNumber || null].filter(Boolean).join(" ") || shop.businessName;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.businessName)}&am=${finalInvoiceBill.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
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
  }, [shop.upiId, shop.businessName, finalInvoiceBill.grandTotal, invoiceTableNumber, invoiceNumber, invoicePaymentStatus, hasUnsentItems]);

  function buildUpiUrl() {
    const note = [invoiceTableNumber ? `Table ${invoiceTableNumber}` : null, invoiceNumber || null].filter(Boolean).join(" ") || shop.businessName;
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

  function retryGenerateBill() {
    if (session) requestBill(session.id);
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

  function handlePlaceOrder(values: CheckoutInput) {
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
        sessionOrders?: { status: string; items: { productId: string | null; name: string; price: number; quantity: number; categoryId?: string }[] }[];
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
  // Gated on the session actually being past ACTIVE (not just "not currently
  // requesting") so there's no one-frame flash of payment options before the
  // auto-request effect above has had a chance to run.
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
            {prefilledTable ? `Table #${prefilledTable} Final Bill` : "Final Bill"}
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
            description="Head back to the menu to add items — your bill will show up here once you do."
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
                  {prefilledTable ? `Dine-In Invoice — Table #${prefilledTable}` : "Invoice"}
                </p>
                {invoiceNumber && <p className="mt-2 text-xs text-muted-foreground font-mono">{invoiceNumber}</p>}
              </div>

              {(invoiceCustomerName || invoiceCustomerPhone) && (
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
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 py-3 space-y-2 border-b">
                {alreadyOrderedItems.length > 0 && (
                  <div className="flex items-center justify-between pb-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordered items</p>
                    <ItemStatusBadge status={sessionItemStatus(session?.status ?? "ACTIVE")} />
                  </div>
                )}
                {alreadyOrderedItems.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
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
                      <div key={item.productId} className="flex items-start justify-between gap-2 text-sm">
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

                  <Button
                    type="submit"
                    size="lg"
                    disabled={placing || billAlreadyRequested}
                    className="h-12 w-full gap-2 bg-[#25D366] text-white hover:bg-[#1ea952] shadow-sm shadow-[#25D366]/20"
                  >
                    <WhatsAppIcon className="size-4.5" />
                    {placing ? "Opening WhatsApp…" : "Place Order on WhatsApp"}
                  </Button>
                </form>
                <p className="text-center text-xs text-muted-foreground">
                  Payment options appear here once your order is sent.
                </p>
              </div>
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
                  <>
                    {upiQrDataUrl && (
                      <div className="rounded-xl border bg-card overflow-hidden">
                        <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
                          <QrCodeIcon className="size-3.5 text-muted-foreground" />
                          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Scan to Pay via UPI</p>
                        </div>
                        <div className="px-4 py-4 flex flex-col items-center gap-2">
                          <div className="rounded-2xl border-2 border-border bg-white p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={upiQrDataUrl} alt="UPI payment QR code" width={200} height={200} />
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
                          <Button size="lg" className="h-12 w-full gap-2 bg-orange-500 text-white hover:bg-orange-600" onClick={handleCashPayment}>
                            <Banknote className="size-4.5" /> Cash Payment ({formatCurrency(finalInvoiceBill.grandTotal, shop.currency)})
                          </Button>
                        )}
                        {shop.upiId && (
                          <Button size="lg" className="h-12 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={handlePayViaUpi}>
                            <QrCodeIcon className="size-4.5" /> Pay {formatCurrency(finalInvoiceBill.grandTotal, shop.currency)} via GPay / UPI
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="h-11 flex-1 gap-1.5" disabled={downloadingInvoicePdf} onClick={handleDownloadInvoicePdf}>
                    <Download className="size-4" /> {downloadingInvoicePdf ? "Generating…" : "Download"}
                  </Button>
                  <Button variant="outline" className="h-11 flex-1 gap-1.5" onClick={() => window.print()}>
                    <Printer className="size-4" /> Print
                  </Button>
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
