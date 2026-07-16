"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Trash2, ArrowLeft, ShoppingBag } from "lucide-react";
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
        // If the table is pre-filled from the URL, treat it as not-required in the form
        // (the value is injected into checkoutValues at submit time, bypassing the field).
        requireTableNumber: shop.requireTableNumber && !prefilledTable,
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
      // Use the URL-prefilled table when the customer doesn't type it manually.
      tableNumber: values.tableNumber || prefilledTable || "",
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
              {prefilledTable ? (
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground font-medium">Table</span>
                  <span className="font-semibold">{prefilledTable}</span>
                </div>
              ) : shop.requireTableNumber ? (
                <FormRow label="Table number" htmlFor="tableNumber" required error={errors.tableNumber}>
                  <Input id="tableNumber" placeholder="e.g. Table 5" {...register("tableNumber")} />
                </FormRow>
              ) : null}
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
                <div className="rounded-xl border bg-card px-4 py-3 space-y-2 text-sm">
                  <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Payment options</p>
                  {shop.upiId && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">UPI</span>
                      <span className="font-medium">{shop.upiId}</span>
                    </div>
                  )}
                  {shop.bankAccountNumber && (
                    <div className="text-xs text-muted-foreground">
                      {shop.bankName} · {shop.bankAccountNumber} · {shop.bankIfsc}
                    </div>
                  )}
                  {shop.acceptCash && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-success inline-block" />
                      Cash accepted
                    </div>
                  )}
                  {shop.paymentQrImageUrl && (
                    <Image
                      src={shop.paymentQrImageUrl}
                      alt="Payment QR"
                      width={128}
                      height={128}
                      unoptimized
                      className="mx-auto rounded-xl border"
                    />
                  )}
                </div>
              )}

              {checkoutValues.notes && (
                <div className="rounded-xl border bg-card px-4 py-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                  <p className="text-muted-foreground">{checkoutValues.notes}</p>
                </div>
              )}
            </div>

            <div className="border-t bg-background px-5 py-4">
              <Button
                size="lg"
                className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
                disabled={placing}
                onClick={handlePlaceOrder}
              >
                {placing ? "Opening WhatsApp…" : "Place order via WhatsApp"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
