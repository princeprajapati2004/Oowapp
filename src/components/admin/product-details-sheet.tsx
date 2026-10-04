"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff, Pencil, Copy, Trash2, Power } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductImageGallery } from "@/components/customer/product-image-gallery";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { computeUnitProfit } from "@/lib/services/profit";
import { applyOffer } from "@/lib/services/pricing";
import { cn } from "@/lib/utils";
import type { ItemSettingsInput } from "@/lib/validation/item-settings";
import type { ProductRow } from "@/components/admin/products-manager";

const LOW_STOCK_THRESHOLD = 5;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? <span className="text-muted-foreground">Not set</span>}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export function ProductDetailsSheet({
  product,
  onOpenChange,
  currency,
  itemSettings,
  onEdit,
  onDuplicate,
  onToggleAvailable,
  onDeleteRequest,
}: {
  product: ProductRow | null;
  onOpenChange: (open: boolean) => void;
  currency: string;
  itemSettings: ItemSettingsInput;
  onEdit: (product: ProductRow) => void;
  onDuplicate: (product: ProductRow) => void;
  onToggleAvailable: (product: ProductRow) => void;
  onDeleteRequest: (product: ProductRow) => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!product) return null;

  const images = product.imageUrl ? [product.imageUrl, ...product.imageUrls] : product.imageUrls;
  const { profit, profitPercent } = computeUnitProfit(product.price, product.costPrice);
  const hasOffer = itemSettings.offerEnabled && !!product.offerType && product.offerValue != null && product.offerValue > 0;
  const offer = hasOffer ? applyOffer(product.price, product.offerType, product.offerValue) : null;

  const stockBadge =
    itemSettings.stockEnabled && product.stock != null
      ? product.stock <= 0
        ? { label: `Out of stock`, variant: "destructive" as const }
        : product.stock <= LOW_STOCK_THRESHOLD
          ? { label: `Low stock (${product.stock})`, variant: "outline" as const }
          : { label: `In stock (${product.stock})`, variant: "secondary" as const }
      : null;

  return (
    <>
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="space-y-2">
            <SheetTitle className="break-words pr-6 text-base leading-snug">{product.name}</SheetTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={product.isAvailable ? "secondary" : "destructive"}>
                {product.isAvailable ? "Active" : "Disabled"}
              </Badge>
              {!product.isVisible && <Badge variant="outline">Hidden from menu</Badge>}
              {stockBadge && <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>}
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-4 p-4">
            {/* Image gallery */}
            {itemSettings.productImageEnabled && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => images.length > 0 && (setLightboxIndex(0), setLightboxOpen(true))}
                  className="relative block aspect-video w-full overflow-hidden rounded-lg bg-muted"
                  aria-label={images.length > 0 ? "View full-size image" : undefined}
                  disabled={images.length === 0}
                >
                  {images[0] ? (
                    <Image src={images[0]} alt={product.name} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <ImageOff className="size-6 text-muted-foreground/50" />
                    </div>
                  )}
                </button>
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((url: string, i: number) => (
                      <button
                        key={`${url}-${i}`}
                        type="button"
                        onClick={() => (setLightboxIndex(i), setLightboxOpen(true))}
                        className={cn(
                          "relative size-12 shrink-0 overflow-hidden rounded-md border-2",
                          i === 0 ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                        )}
                        aria-label={`View photo ${i + 1} of ${images.length}`}
                      >
                        <Image src={url} alt="" fill className="object-cover" unoptimized />
                      </button>
                    ))}
                    <span className="flex shrink-0 items-center text-[11px] text-muted-foreground">
                      {images.length} photo{images.length === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Basic information */}
            <Section title="Basic information">
              <Field label="Category" value={product.category.name} />
              {itemSettings.productTypeEnabled && <Field label="Product type" value={product.productType} />}
              <Field label="Unit" value={product.unit} />
              <Field label="Created" value={formatDate(product.createdAt)} />
              <Field label="Last updated" value={formatDate(product.updatedAt)} />
              {itemSettings.descriptionEnabled && (
                <div className="col-span-2">
                  <Field label="Description" value={product.description} />
                </div>
              )}
            </Section>

            {/* Classification */}
            <Section title="Classification">
              {itemSettings.productCodeEnabled && <Field label="Product code" value={product.productCode} />}
              {itemSettings.barcodeEnabled && <Field label="Barcode" value={product.barcode} />}
              {itemSettings.hsnEnabled && <Field label="HSN code" value={product.hsnCode} />}
            </Section>

            {/* Pricing */}
            <Section title="Pricing">
              {itemSettings.purchasePriceEnabled && (
                <Field label="Purchase price" value={product.costPrice != null ? formatCurrency(product.costPrice, currency) : null} />
              )}
              <Field label="Selling price" value={formatCurrency(product.price, currency)} />
              {itemSettings.mrpEnabled && (
                <Field label="MRP" value={product.mrp != null ? formatCurrency(product.mrp, currency) : null} />
              )}
              {itemSettings.wholesalePriceEnabled && (
                <Field label="Wholesale price" value={product.wholesalePrice != null ? formatCurrency(product.wholesalePrice, currency) : null} />
              )}
              {profit !== null && (
                <Field
                  label="Profit"
                  value={
                    <span className={profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                      {formatCurrency(profit, currency)} {profitPercent !== null && `(${profitPercent}%)`}
                    </span>
                  }
                />
              )}
            </Section>

            {/* Inventory */}
            {itemSettings.stockEnabled && (
              <Section title="Stock details">
                <Field label="Current stock" value={product.stock != null ? `${product.stock}${product.unit ? ` ${product.unit}` : ""}` : null} />
                <Field label="Opening stock" value={product.openingStock} />
                {itemSettings.serialNumberEnabled && <Field label="Serial number" value={product.serialNumber} />}
                {itemSettings.batchNumberEnabled && <Field label="Batch number" value={product.batchNumber} />}
              </Section>
            )}

            {/* Offer */}
            {itemSettings.offerEnabled && (
              <Section title="Offer">
                {offer ? (
                  <>
                    <Field label="Discount type" value={product.offerType === "PERCENTAGE" ? "Percentage" : "Flat amount"} />
                    <Field
                      label="Discount value"
                      value={product.offerType === "PERCENTAGE" ? `${product.offerValue}%` : formatCurrency(product.offerValue!, currency)}
                    />
                    <Field label="Price after offer" value={formatCurrency(offer.finalPrice, currency)} />
                    {product.offerNote && (
                      <div className="col-span-2">
                        <Field label="Note" value={product.offerNote} />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="col-span-2 text-sm text-muted-foreground">No active offer</p>
                )}
              </Section>
            )}
          </div>

          <SheetFooter className="grid grid-cols-2 gap-2 border-t pt-3">
            <Button onClick={() => onEdit(product)}>
              <Pencil className="size-3.5" /> Edit product
            </Button>
            <Button variant="outline" onClick={() => onDuplicate(product)}>
              <Copy className="size-3.5" /> Duplicate
            </Button>
            <Button variant="outline" onClick={() => onToggleAvailable(product)}>
              <Power className="size-3.5" /> {product.isAvailable ? "Disable" : "Enable"}
            </Button>
            <Button variant="destructive" onClick={() => onDeleteRequest(product)}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ProductImageGallery
        images={images}
        productName={product.name}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        initialIndex={lightboxIndex}
      />
    </>
  );
}
