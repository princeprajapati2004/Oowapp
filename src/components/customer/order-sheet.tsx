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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onOrderPlaced: () => void;
  shop: CustomerShop;
  taxes: CustomerTax[];
}) {
  const [step, setStep] = useState<Step>("cart");
  const [checkoutValues, setCheckoutValues] = useState<CheckoutInput | null>(null);
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
        requireTableNumber: shop.requireTableNumber,
        requireDeliveryAddress: shop.requireDeliveryAddress,
      }),
    [shop]
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
    setCheckoutValues(values);
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
    window.location.href = url;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[90vh] max-w-lg flex-col overflow-y-auto rounded-t-2xl"
      >
        {step === "cart" && (
          <>
            <SheetHeader>
              <SheetTitle>Your cart</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-3 px-4">
              {items.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="Your cart is empty"
                  description="Add items from the menu to get started."
                />
              ) : (
                items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.price, shop.currency)} each
                      </p>
                    </div>
                    <QtyStepper
                      size="sm"
                      value={item.quantity}
                      onChange={(q) => onSetQuantity(item.productId, q)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(item.productId)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            {items.length > 0 && (
              <SheetFooter className="gap-2">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Subtotal</span>
                  <span>{formatCurrency(bill.subtotal, shop.currency)}</span>
                </div>
                <Button size="lg" className="w-full" onClick={() => setStep("checkout")}>
                  Checkout
                </Button>
              </SheetFooter>
            )}
          </>
        )}

        {step === "checkout" && (
          <>
            <SheetHeader>
              <button
                type="button"
                onClick={() => setStep("cart")}
                className="mb-1 flex items-center gap-1 text-sm text-muted-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back to cart
              </button>
              <SheetTitle>Your details</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit(handleGenerateBill)} className="flex-1 space-y-4 px-4">
              {shop.requireCustomerName && (
                <FormRow label="Name" htmlFor="customerName" required error={errors.customerName}>
                  <Input id="customerName" {...register("customerName")} />
                </FormRow>
              )}
              {shop.requirePhone && (
                <FormRow label="Phone number" htmlFor="customerPhone" required error={errors.customerPhone}>
                  <Input id="customerPhone" inputMode="numeric" {...register("customerPhone")} />
                </FormRow>
              )}
              {shop.requireTableNumber && (
                <FormRow label="Table number" htmlFor="tableNumber" required error={errors.tableNumber}>
                  <Input id="tableNumber" {...register("tableNumber")} />
                </FormRow>
              )}
              {shop.requireDeliveryAddress && (
                <FormRow
                  label="Delivery address"
                  htmlFor="deliveryAddress"
                  required
                  error={errors.deliveryAddress}
                >
                  <Textarea id="deliveryAddress" rows={2} {...register("deliveryAddress")} />
                </FormRow>
              )}
              {shop.allowNotes && (
                <FormRow label="Special instructions" htmlFor="notes" description="Optional">
                  <Textarea id="notes" rows={2} {...register("notes")} />
                </FormRow>
              )}

              <Button type="submit" size="lg" className="w-full">
                Generate bill
              </Button>
            </form>
          </>
        )}

        {step === "bill" && checkoutValues && (
          <>
            <SheetHeader>
              <button
                type="button"
                onClick={() => setStep("checkout")}
                className="mb-1 flex items-center gap-1 text-sm text-muted-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <SheetTitle>Your bill</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-4 px-4 text-sm">
              <div className="text-center">
                {shop.logoUrl ? (
                  <Image
                    src={shop.logoUrl}
                    alt={shop.businessName}
                    width={48}
                    height={48}
                    unoptimized
                    className="mx-auto mb-1 rounded-full object-cover"
                  />
                ) : null}
                <p className="font-bold">{shop.businessName}</p>
                {shop.address ? <p className="text-xs text-muted-foreground">{shop.address}</p> : null}
                {shop.phone ? <p className="text-xs text-muted-foreground">{shop.phone}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Bill No: {generateBillNumber(shop.slug)} &middot; {new Date().toLocaleString()}
                </p>
              </div>

              <div className="space-y-1 border-y py-2">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between">
                    <span>
                      {item.quantity} x {item.name}
                    </span>
                    <span>{formatCurrency(item.price * item.quantity, shop.currency)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
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
                <div className="flex justify-between border-t pt-1.5 text-base font-bold">
                  <span>Grand total</span>
                  <span>{formatCurrency(bill.grandTotal, shop.currency)}</span>
                </div>
              </div>

              {(shop.upiId || shop.paymentQrImageUrl || shop.acceptCash || shop.bankAccountNumber) && (
                <div className="space-y-1 rounded-lg border p-3 text-xs">
                  <p className="font-semibold">Payment options</p>
                  {shop.upiId ? <p>UPI: {shop.upiId}</p> : null}
                  {shop.bankAccountNumber ? (
                    <p>
                      Bank: {shop.bankName} &middot; {shop.bankAccountNumber} &middot; {shop.bankIfsc}
                    </p>
                  ) : null}
                  {shop.acceptCash ? <p>Cash accepted</p> : null}
                  {shop.paymentQrImageUrl ? (
                    <Image
                      src={shop.paymentQrImageUrl}
                      alt="Payment QR"
                      width={120}
                      height={120}
                      unoptimized
                      className="mx-auto rounded-lg border"
                    />
                  ) : null}
                </div>
              )}

              {checkoutValues.notes ? (
                <p className="text-xs text-muted-foreground">Notes: {checkoutValues.notes}</p>
              ) : null}
            </div>
            <SheetFooter>
              <Button
                size="lg"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={placing}
                onClick={handlePlaceOrder}
              >
                {placing ? "Placing order…" : "Place order via WhatsApp"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
