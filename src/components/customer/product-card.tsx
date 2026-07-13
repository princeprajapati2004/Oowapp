"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
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
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md",
        !product.isAvailable && "opacity-60"
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-muted">
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageOff className="size-6 text-muted-foreground" />
          </div>
        )}
        {product.foodType !== "NA" && (
          <span
            className={cn(
              "absolute left-2 top-2 flex size-4 items-center justify-center rounded border-2 bg-background",
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
        {quantityInCart > 0 && (
          <Badge className="absolute right-2 top-2 bg-emerald-600 text-white">{quantityInCart} in cart</Badge>
        )}
        {!product.isAvailable && (
          <Badge variant="destructive" className="absolute inset-x-2 bottom-2 justify-center">
            Out of stock
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-medium leading-tight">{product.name}</p>
        {product.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="font-semibold">{formatCurrency(product.price, currency)}</span>
          {product.unit ? <span className="text-xs text-muted-foreground">/{product.unit}</span> : null}
        </div>
      </div>
    </button>
  );
}
