"use client";

import Image from "next/image";
import { ImageOff, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { CustomerProduct } from "@/lib/types/customer";

export function ProductCard({
  product,
  currency,
  quantityInCart,
  onOpen,
}: {
  product: CustomerProduct;
  currency: string;
  quantityInCart: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
        !product.isAvailable && "opacity-60"
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-muted overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
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

        {quantityInCart > 0 ? (
          <div className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">
            {quantityInCart}
          </div>
        ) : (
          product.isAvailable && (
            <div className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
              <Plus className="size-3.5" />
            </div>
          )
        )}

        {!product.isAvailable && (
          <div className="absolute inset-0 flex items-end justify-center bg-background/40 pb-2">
            <span className="rounded-full bg-destructive/90 px-2.5 py-0.5 text-xs font-medium text-white">
              Out of stock
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-medium leading-tight line-clamp-2">{product.name}</p>
        {product.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">{product.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <span className="text-sm font-bold">{formatCurrency(product.price, currency)}</span>
          {product.unit ? <span className="text-xs text-muted-foreground">/{product.unit}</span> : null}
        </div>
      </div>
    </button>
  );
}
