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

// Inline food-type dot used in both card layouts.
function FoodTypeDot({ foodType }: { foodType: CustomerProduct["foodType"] }) {
  if (foodType === "NA") return null;
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border-2 bg-background/90",
        foodType === "VEG"
          ? "border-emerald-600"
          : foodType === "EGG"
            ? "border-amber-700"
            : "border-red-600"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          foodType === "VEG"
            ? "bg-emerald-600"
            : foodType === "EGG"
              ? "bg-amber-700"
              : "bg-red-600"
        )}
      />
    </span>
  );
}

export function ProductCard({
  product,
  currency,
  quantityInCart,
  minQuantity = 0,
  onQuantityChange,
  showImages = true,
}: {
  product: CustomerProduct;
  currency: string;
  quantityInCart: number;
  minQuantity?: number;
  onQuantityChange: (quantity: number) => void;
  showImages?: boolean;
}) {
  if (!showImages) {
    // Compact horizontal list-style card — no image, tighter layout.
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md",
          !product.isAvailable && "opacity-60"
        )}
      >
        <FoodTypeDot foodType={product.foodType} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-medium leading-tight line-clamp-2 text-sm">{product.name}</p>
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            <span className="text-sm font-bold">{formatCurrency(product.price, currency)}</span>
            {product.unit ? <span className="text-xs text-muted-foreground">/{product.unit}</span> : null}
          </div>
          {product.offerNote ? (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 leading-tight">
              {product.offerNote}
            </p>
          ) : null}
          {!product.isAvailable && (
            <span className="self-start rounded-full bg-destructive/90 px-2 py-0.5 text-xs font-medium text-white">
              Out of stock
            </span>
          )}
        </div>
        {product.isAvailable && (
          <div className="shrink-0">
            <QtyStepper value={quantityInCart} min={minQuantity} max={MAX_QUANTITY} onChange={onQuantityChange} />
          </div>
        )}
      </div>
    );
  }

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
              product.foodType === "VEG"
                ? "border-emerald-600"
                : product.foodType === "EGG"
                  ? "border-amber-700"
                  : "border-red-600"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                product.foodType === "VEG"
                  ? "bg-emerald-600"
                  : product.foodType === "EGG"
                    ? "bg-amber-700"
                    : "bg-red-600"
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
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-sm font-bold">{formatCurrency(product.price, currency)}</span>
            {product.unit ? <span className="text-xs text-muted-foreground">/{product.unit}</span> : null}
          </div>
          {product.offerNote ? (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 leading-tight">
              {product.offerNote}
            </p>
          ) : null}
          {product.isAvailable && (
            <div className="flex justify-center border-t pt-2">
              <QtyStepper value={quantityInCart} min={minQuantity} max={MAX_QUANTITY} onChange={onQuantityChange} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
