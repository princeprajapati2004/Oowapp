"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { QtyStepper } from "@/components/shared/qty-stepper";
import { formatCurrency } from "@/lib/utils/currency";
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
      <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-2xl">
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
      <div className="relative mx-4 h-48 overflow-hidden rounded-xl bg-muted">
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageOff className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <SheetHeader>
        <SheetTitle className="text-xl">{product.name}</SheetTitle>
      </SheetHeader>
      <div className="space-y-3 px-4">
        {product.description ? <p className="text-sm text-muted-foreground">{product.description}</p> : null}
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">{formatCurrency(product.price, currency)}</span>
          <QtyStepper value={qty} onChange={setQty} />
        </div>
      </div>
      <SheetFooter>
        <Button
          size="lg"
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={!product.isAvailable}
          onClick={() => onAddToCart(qty)}
        >
          {product.isAvailable ? "Add to cart" : "Out of stock"}
        </Button>
      </SheetFooter>
    </>
  );
}
