"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, ArrowLeft, ShoppingBag, Download, CircleCheck, MapPinned, History, Table2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QtyStepper } from "@/components/shared/qty-stepper";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { PhoneVerification } from "@/components/customer/phone-verification";
import { formatCurrency } from "@/lib/utils/currency";
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
import type { CartItem } from "@/lib/hooks/use-cart";
import type { ActiveSession, CustomerShop, CustomerTax } from "@/lib/types/customer";

type Step = "cart" | "checkout" | "bill" | "placed";

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
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 40;

      // Logo
      if (shop.logoUrl) {
        try {
          const resp = await fetch(shop.logoUrl);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const imgW = 50;
          doc.addImage(dataUrl, "WEBP", (pageWidth - imgW) / 2, y, imgW, imgW);
          y += 58;
        } catch {
          // Logo failed to load — skip it
        }
      }

      // Business header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(shop.businessName, pageWidth / 2, y, { align: "center" });
      y += 20;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      if (shop.address) { doc.text(shop.address, pageWidth / 2, y, { align: "center" }); y += 13; }
      if (shop.phone) { doc.text(shop.phone, pageWidth / 2, y, { align: "center" }); y += 13; }
      y += 6;

      // Divider
      doc.setDrawColor(200);
      doc.line(40, y, pageWidth - 40, y);
      y += 12;

      // Bill info
      doc.setTextColor(0);
      doc.setFontSize(9);
      doc.text(`Bill No: ${billNumber}`, 40, y);
      doc.text(new Date().toLocaleString(), pageWidth - 40, y, { align: "right" });
      y += 16;

      // Customer details
      const custFields: string[] = [];
      if (checkoutValues.customerName) custFields.push(`Name: ${checkoutValues.customerName}`);
      if (checkoutValues.customerPhone) custFields.push(`Phone: ${checkoutValues.customerPhone}`);
      if (checkoutValues.tableNumber) custFields.push(`Table: ${checkoutValues.tableNumber}`);
      if (checkoutValues.deliveryAddress) custFields.push(`Address: ${checkoutValues.deliveryAddress}`);
      if (custFields.length > 0) {
        custFields.forEach((f) => { doc.text(f, 40, y); y += 13; });
        y += 4;
      }

      // Divider
      doc.line(40, y, pageWidth - 40, y);
      y += 12;

      // Items header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Item", 40, y);
      doc.text("Qty", pageWidth / 2 + 20, y, { align: "right" });
      doc.text("Amount", pageWidth - 40, y, { align: "right" });
      y += 4;
      doc.setDrawColor(200);
      doc.line(40, y, pageWidth - 40, y);
      y += 10;
      doc.setFont("helvetica", "normal");

      items.forEach((item) => {
        const lineH = 14;
        const nameLines = doc.splitTextToSize(item.name, pageWidth / 2);
        doc.text(nameLines, 40, y);
        doc.text(`×${item.quantity}`, pageWidth / 2 + 20, y, { align: "right" });
        doc.text(formatCurrency(item.price * item.quantity, shop.currency), pageWidth - 40, y, { align: "right" });
        y += Math.max(nameLines.length * lineH, lineH);
      });

      y += 4;
      doc.line(40, y, pageWidth - 40, y);
      y += 12;

      // Totals
      doc.setFontSize(9);
      doc.text("Subtotal", 40, y);
      doc.text(formatCurrency(bill.subtotal, shop.currency), pageWidth - 40, y, { align: "right" });
      y += 14;

      bill.taxLines.forEach((line) => {
        doc.setTextColor(100);
        doc.text(line.name, 40, y);
        doc.text(formatCurrency(line.amount, shop.currency), pageWidth - 40, y, { align: "right" });
        doc.setTextColor(0);
        y += 14;
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Grand Total", 40, y);
      doc.text(formatCurrency(bill.grandTotal, shop.currency), pageWidth - 40, y, { align: "right" });
      y += 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      // Payment section
      const hasPayment = shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl;
      if (hasPayment) {
        doc.line(40, y, pageWidth - 40, y);
        y += 12;
        doc.setFont("helvetica", "bold");
        doc.text("Payment", 40, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        if (shop.upiId) { doc.text(`UPI: ${shop.upiId}`, 40, y); y += 13; }
        if (shop.bankAccountNumber) {
          doc.text(`Bank: ${shop.bankName ?? ""} | A/C: ${shop.bankAccountNumber} | IFSC: ${shop.bankIfsc ?? ""}`, 40, y);
          y += 13;
        }
        if (shop.acceptCash) { doc.text("Cash accepted", 40, y); y += 13; }

        if (shop.paymentQrImageUrl) {
          try {
            const resp = await fetch(shop.paymentQrImageUrl);
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            const qrSize = 100;
            doc.addImage(dataUrl, "PNG", (pageWidth - qrSize) / 2, y, qrSize, qrSize);
            y += qrSize + 8;
          } catch {
            // QR failed to load — skip
          }
        }
      }

      // Notes
      if (checkoutValues.notes) {
        y += 4;
        doc.line(40, y, pageWidth - 40, y);
        y += 12;
        doc.setFont("helvetica", "bold");
        doc.text("Notes", 40, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        const noteLines = doc.splitTextToSize(checkoutValues.notes, pageWidth - 80);
        doc.text(noteLines, 40, y);
        y += noteLines.length * 13;
        doc.setTextColor(0);
      }

      // Footer
      y += 16;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100);
      doc.text("Thank you for your order!", pageWidth / 2, y, { align: "center" });

      doc.save(`bill-${billNumber}.pdf`);
    } catch {
      // PDF generation failed silently
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Already on this table
                  </p>
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
                items.map((item) => (
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
                ))
              )}
            </div>
            {items.length > 0 && (
              <div className="border-t bg-background px-5 py-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal ({items.length} item{items.length !== 1 ? "s" : ""})</span>
                  <span className="font-semibold">{formatCurrency(bill.subtotal, shop.currency)}</span>
                </div>
                <Button
                  size="lg"
                  className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
                  onClick={() => setStep("checkout")}
                >
                  Proceed to checkout
                </Button>
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

              {(shop.upiId || shop.paymentQrImageUrl || shop.acceptCash || shop.bankAccountNumber) && (
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
              )}

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
