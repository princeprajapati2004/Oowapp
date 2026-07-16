"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { QtyStepper } from "@/components/shared/qty-stepper";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { CustomerProduct } from "@/lib/types/customer";

export function ItemDetailSheet({
  product,
  currency,
  initialQuantity,
  onClose,
  onAddToCart,
}: {
  product: CustomerProduct | null;
  currency: string;
  initialQuantity: number;
  onClose: () => void;
  onAddToCart: (quantity: number) => void;
}) {
  return (
    <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-2xl gap-3">
        {product ? (
          // Keyed by product id so the qty stepper's local state always starts fresh for the newly opened item.
          <ItemDetailContent
            key={product.id}
            product={product}
            currency={currency}
            initialQuantity={initialQuantity}
            onAddToCart={onAddToCart}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ItemDetailContent({
  product,
  currency,
  initialQuantity,
  onAddToCart,
}: {
  product: CustomerProduct;
  currency: string;
  initialQuantity: number;
  onAddToCart: (quantity: number) => void;
}) {
  const [qty, setQty] = useState(Math.max(1, initialQuantity));

  return (
    <>
      <div className="relative mx-4 h-52 overflow-hidden rounded-2xl bg-muted">
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted">
            <ImageOff className="size-10 text-muted-foreground/40" />
          </div>
        )}
        {product.foodType !== "NA" && (
          <span
            className={cn(
              "absolute left-3 top-3 flex size-5 items-center justify-center rounded border-2 bg-background/90",
              product.foodType === "VEG" ? "border-emerald-600" : "border-red-600"
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                product.foodType === "VEG" ? "bg-emerald-600" : "bg-red-600"
              )}
            />
          </span>
        )}
      </div>
      <SheetHeader className="px-4">
        <SheetTitle className="text-xl leading-tight">{product.name}</SheetTitle>
      </SheetHeader>
      <div className="space-y-4 px-4">
        {product.description ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
        ) : null}
        <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
          <span className="text-xl font-bold">{formatCurrency(product.price, currency)}</span>
          <QtyStepper value={qty} onChange={setQty} />
        </div>
      </div>
      <SheetFooter className="px-4">
        <Button
          size="lg"
          className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all"
          disabled={!product.isAvailable}
          onClick={() => onAddToCart(qty)}
        >
          {product.isAvailable
            ? `Add to cart · ${formatCurrency(product.price * qty, currency)}`
            : "Out of stock"}
        </Button>
      </SheetFooter>
    </>
  );
}
