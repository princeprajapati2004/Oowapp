"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Trash2, ArrowLeft, ShoppingBag, Download } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QtyStepper } from "@/components/shared/qty-stepper";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils/currency";
import { calculateBill } from "@/lib/services/billing";
import { buildOrderMessage, buildWhatsAppUrl, generateBillNumber } from "@/lib/services/whatsapp";
import { buildCheckoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { api } from "@/lib/api-client";
import type { CartItem } from "@/lib/hooks/use-cart";
import type { CustomerShop, CustomerTax } from "@/lib/types/customer";

type Step = "cart" | "checkout" | "bill";

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
}) {
  const [step, setStep] = useState<Step>("cart");
  const [checkoutValues, setCheckoutValues] = useState<CheckoutInput | null>(null);
  const [billNumber, setBillNumber] = useState<string>("");
  const [placing, setPlacing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Reset to the cart step whenever the sheet transitions from closed to open.
  // Adjusting state during render (rather than in an effect) avoids an extra render pass —
  // see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep("cart");
  }

  const schema = useMemo(
    () =>
      buildCheckoutSchema({
        requireCustomerName: shop.requireCustomerName,
        requirePhone: shop.requirePhone,
        // Table number is only required when the feature is enabled AND there's no prefilled value.
        requireTableNumber: shop.enableTableNumber && shop.requireTableNumber && !prefilledTable,
        requireDeliveryAddress: shop.requireDeliveryAddress,
      }),
    [shop, prefilledTable]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutInput>({ resolver: zodResolver(schema) });

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

  function handleGenerateBill(values: CheckoutInput) {
    setCheckoutValues({
      ...values,
      tableNumber: shop.enableTableNumber
        ? (values.tableNumber || prefilledTable || "")
        : "",
    });
    setBillNumber(generateBillNumber(shop.slug));
    setStep("bill");
  }

  async function handlePlaceOrder() {
    if (!checkoutValues) return;
    setPlacing(true);

    const message = buildOrderMessage({
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

    // Fire-and-forget persistence — the WhatsApp handoff never waits on this.
    api
      .post("/api/orders", {
        shopSlug: shop.slug,
        billNumber,
        customerName: checkoutValues.customerName,
        customerPhone: checkoutValues.customerPhone,
        tableNumber: checkoutValues.tableNumber,
        deliveryAddress: checkoutValues.deliveryAddress,
        notes: checkoutValues.notes,
        items,
      })
      .catch(() => {
        // Non-critical — the order still goes out via WhatsApp regardless.
      });

    onOrderPlaced();
    setPlacing(false);
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
            <form onSubmit={handleSubmit(handleGenerateBill)} className="flex-1 overflow-y-auto px-5 pb-4 space-y-4 pt-4">
              {shop.requireCustomerName && (
                <FormRow label="Name" htmlFor="customerName" required error={errors.customerName}>
                  <Input id="customerName" placeholder="Your name" {...register("customerName")} />
                </FormRow>
              )}
              {shop.requirePhone && (
                <FormRow label="Phone number" htmlFor="customerPhone" required error={errors.customerPhone}>
                  <Input id="customerPhone" inputMode="numeric" placeholder="Your phone number" {...register("customerPhone")} />
                </FormRow>
              )}
              {shop.enableTableNumber && (
                prefilledTable ? (
                  <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground font-medium">Table</span>
                    <span className="font-semibold">{prefilledTable}</span>
                  </div>
                ) : (
                  <FormRow
                    label="Table number"
                    htmlFor="tableNumber"
                    required={shop.requireTableNumber}
                    error={errors.tableNumber}
                  >
                    <Input id="tableNumber" placeholder="e.g. Table 5" {...register("tableNumber")} />
                  </FormRow>
                )
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
                Review bill
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
                    <span>Grand total</span>
                    <span className="text-primary">{formatCurrency(bill.grandTotal, shop.currency)}</span>
                  </div>
                </div>
              </div>

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
                disabled={placing}
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
      </SheetContent>
    </Sheet>
  );
}
