"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { QtyStepper } from "@/components/shared/qty-stepper";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { CustomerProduct } from "@/lib/types/customer";

// No artificial ceiling on quantity — QtyStepper defaults to max=99, which
// would silently cap orders; override it the same way order-tracker.tsx does.
const MAX_QUANTITY = 100_000;

export function ProductCard({
  product,
  currency,
  quantityInCart,
  onQuantityChange,
}: {
  product: CustomerProduct;
  currency: string;
  quantityInCart: number;
  onQuantityChange: (quantity: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md",
        !product.isAvailable && "opacity-60"
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-muted overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted">
            <ImageOff className="size-6 text-muted-foreground/50" />
          </div>
        )}

        {product.foodType !== "NA" && (
          <span
            className={cn(
              "absolute left-2 top-2 flex size-4 items-center justify-center rounded border-2 bg-background/90",
              product.foodType === "VEG" ? "border-emerald-600" : "border-red-600"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                product.foodType === "VEG" ? "bg-emerald-600" : "bg-red-600"
              )}
            />
          </span>
        )}

        {!product.isAvailable && (
          <div className="absolute inset-0 flex items-end justify-center bg-background/40 pb-2">
            <span className="rounded-full bg-destructive/90 px-2.5 py-0.5 text-xs font-medium text-white">
              Out of stock
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="font-medium leading-tight line-clamp-2">{product.name}</p>
        {product.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">{product.description}</p>
        ) : null}
        <div className="mt-auto space-y-2 pt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-bold">{formatCurrency(product.price, currency)}</span>
            {product.unit ? <span className="text-xs text-muted-foreground">/{product.unit}</span> : null}
          </div>
          {product.isAvailable && (
            <div className="flex justify-center border-t pt-2">
              <QtyStepper value={quantityInCart} min={0} max={MAX_QUANTITY} onChange={onQuantityChange} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
