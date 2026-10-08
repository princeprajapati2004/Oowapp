"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormRow } from "@/components/shared/form-row";
import { ProductImageManager } from "@/components/admin/product-image-manager";
import { BarcodeScanButton } from "@/components/admin/barcode-scan-button";
import { ProductPartyPrices } from "@/components/admin/product-party-prices";
import { api, ApiError } from "@/lib/api-client";
import { isFoodBusiness, type BusinessType } from "@/lib/business-types";
import { formatCurrency } from "@/lib/utils/currency";
import { computeUnitProfit } from "@/lib/services/profit";
import { applyOffer } from "@/lib/services/pricing";
import { cn } from "@/lib/utils";
import type { Category } from "@/generated/prisma/client";
import type { listProducts } from "@/lib/services/product";
import type { ItemSettingsInput } from "@/lib/validation/item-settings";
import type { ProductRow } from "@/components/admin/products-manager";

type ItemSettings = ItemSettingsInput;
type PartyOption = { id: string; name: string; phone: string };

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  costPrice: "",
  mrp: "",
  wholesalePrice: "",
  categoryId: "",
  imageUrl: null as string | null,
  imageUrls: [] as string[],
  unit: "",
  barcode: "",
  hsnCode: "",
  productCode: "",
  productType: "",
  serialNumber: "",
  batchNumber: "",
  foodType: "NA" as "VEG" | "NON_VEG" | "EGG" | "NA",
  isCombo: false,
  offerNote: "",
  isAvailable: true,
  isVisible: true,
  stock: "" as string,
  offerType: "NONE" as "NONE" | "PERCENTAGE" | "FLAT",
  offerValue: "" as string,
};

const TABS = ["basic", "pricing", "inventory", "barcode", "advanced", "offer"] as const;
type TabId = (typeof TABS)[number];
const TAB_LABELS: Record<TabId, string> = {
  basic: "Basic",
  pricing: "Pricing",
  inventory: "Inventory",
  barcode: "Barcode",
  advanced: "Advanced",
  offer: "Offer",
};

function formFromProduct(product: ProductRow): typeof EMPTY_FORM {
  return {
    name: product.name,
    description: product.description ?? "",
    price: String(product.price),
    costPrice: product.costPrice != null ? String(product.costPrice) : "",
    mrp: product.mrp != null ? String(product.mrp) : "",
    wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : "",
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    imageUrls: product.imageUrls ?? [],
    unit: product.unit ?? "",
    barcode: product.barcode ?? "",
    hsnCode: product.hsnCode ?? "",
    productCode: product.productCode ?? "",
    productType: product.productType ?? "",
    serialNumber: product.serialNumber ?? "",
    batchNumber: product.batchNumber ?? "",
    foodType: product.foodType,
    isCombo: product.isCombo,
    offerNote: product.offerNote ?? "",
    isAvailable: product.isAvailable,
    isVisible: product.isVisible,
    stock: product.stock === null || product.stock === undefined ? "" : String(product.stock),
    offerType: (product.offerType as "PERCENTAGE" | "FLAT" | null) ?? "NONE",
    offerValue: product.offerValue != null ? String(product.offerValue) : "",
  };
}

// Full-page Add/Edit Product — replaces the old centered tabbed Dialog in
// products-manager.tsx (popup-to-full-page conversion, batch 1). Same
// field set/validation/payload as before; only the chrome around it changed
// from a Dialog to create-order-page.tsx's header/footer language.
export function ProductFormPage({
  product,
  categories,
  currency,
  businessType,
  itemSettings,
  parties,
}: {
  product?: ProductRow;
  categories: Category[];
  currency: string;
  businessType: BusinessType;
  itemSettings: ItemSettings;
  parties: PartyOption[];
}) {
  const router = useRouter();
  const isEditing = !!product;

  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const [form, setForm] = useState(() =>
    product ? formFromProduct(product) : { ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" }
  );
  const [saving, setSaving] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  const filteredCategories = categorySearch.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()))
    : categories;

  function goBack() {
    router.push("/admin/products");
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.categoryId) return toast.error("Select a category");
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return toast.error("Enter a valid price");
    if (!form.unit.trim()) return toast.error("Select a unit");
    const costPriceNum = form.costPrice.trim() === "" ? null : Number(form.costPrice);
    if (costPriceNum !== null && (!Number.isFinite(costPriceNum) || costPriceNum < 0)) {
      return toast.error("Enter a valid purchase price");
    }
    const mrpNum = form.mrp.trim() === "" ? null : Number(form.mrp);
    if (mrpNum !== null && (!Number.isFinite(mrpNum) || mrpNum < 0)) {
      return toast.error("Enter a valid MRP");
    }
    const wholesaleNum = form.wholesalePrice.trim() === "" ? null : Number(form.wholesalePrice);
    if (wholesaleNum !== null && (!Number.isFinite(wholesaleNum) || wholesaleNum < 0)) {
      return toast.error("Enter a valid wholesale price");
    }
    if (itemSettings.hsnEnabled && itemSettings.hsnRequired && !form.hsnCode.trim()) {
      return toast.error("HSN code is required");
    }
    const offerValueNum = form.offerValue.trim() === "" ? null : Number(form.offerValue);
    if (form.offerType !== "NONE" && (offerValueNum === null || !Number.isFinite(offerValueNum) || offerValueNum <= 0)) {
      return toast.error("Enter an offer value");
    }

    const payload = {
      name: form.name,
      description: form.description,
      price: priceNum,
      costPrice: costPriceNum,
      mrp: mrpNum,
      wholesalePrice: wholesaleNum,
      categoryId: form.categoryId,
      imageUrl: form.imageUrl,
      imageUrls: form.imageUrls,
      unit: form.unit,
      barcode: form.barcode,
      hsnCode: form.hsnCode,
      productCode: form.productCode,
      productType: form.productType,
      serialNumber: form.serialNumber,
      batchNumber: form.batchNumber,
      foodType: form.foodType,
      isCombo: form.isCombo,
      offerNote: form.offerNote,
      isAvailable: form.isAvailable,
      isVisible: form.isVisible,
      stock: form.stock === "" ? null : Number(form.stock),
      offerType: form.offerType === "NONE" ? null : form.offerType,
      offerValue: form.offerType === "NONE" ? null : offerValueNum,
      sortOrder: product?.sortOrder,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await api.patch<Awaited<ReturnType<typeof listProducts>>[number]>(`/api/admin/products/${product.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post<Awaited<ReturnType<typeof listProducts>>[number]>("/api/admin/products", payload);
        toast.success("Product added");
      }
      router.push("/admin/products");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b bg-background/98 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={goBack}
          aria-label="Back to products"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-semibold">{isEditing ? "Edit Product" : "Add Product"}</h1>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => v && setActiveTab(v as TabId)} className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 border-b px-4 pt-2 overflow-x-auto">
          <TabsList variant="line">
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {TAB_LABELS[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-5">
          <TabsContent value="basic" className="space-y-4">
            {itemSettings.productImageEnabled && (
              <FormRow
                label="Product images"
                htmlFor="product-images"
                description="Select multiple at once. The first (or starred) image is the primary photo shown on product cards, search, and order lines."
              >
                <ProductImageManager
                  images={form.imageUrl ? [form.imageUrl, ...form.imageUrls] : form.imageUrls}
                  onChange={(images) => setForm((f) => ({ ...f, imageUrl: images[0] ?? null, imageUrls: images.slice(1) }))}
                  max={8}
                />
              </FormRow>
            )}

            <FormRow label="Name" htmlFor="product-name" required>
              <Input id="product-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </FormRow>

            {itemSettings.productCodeEnabled && (
              <FormRow label="Product code" htmlFor="product-code" description="Leave blank to auto-generate (e.g. ITEM-001)">
                <Input
                  id="product-code"
                  value={form.productCode}
                  onChange={(e) => setForm((f) => ({ ...f, productCode: e.target.value }))}
                  placeholder="e.g. ITEM-001"
                />
              </FormRow>
            )}

            <FormRow label="Category" htmlFor="product-category" required={itemSettings.categoryRequired}>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v ?? "" }))}>
                <SelectTrigger id="product-category" className="w-full">
                  <SelectValue>{categories.find((c) => c.id === form.categoryId)?.name ?? "Select category"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.length > 5 && (
                    <div className="px-2 pb-1.5 pt-1">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          className="w-full rounded-md border bg-transparent py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Search categories…"
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  )}
                  {filteredCategories.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No categories found</div>
                  ) : (
                    filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </FormRow>

            {itemSettings.productTypeEnabled && (
              <FormRow label="Item/Product type" htmlFor="product-type" description="e.g. Product, Service, Raw Material">
                <Input id="product-type" value={form.productType} onChange={(e) => setForm((f) => ({ ...f, productType: e.target.value }))} />
              </FormRow>
            )}

            {itemSettings.descriptionEnabled && (
              <FormRow label="Description" htmlFor="product-description">
                <Textarea id="product-description" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </FormRow>
            )}

            {isFoodBusiness(businessType) && (
              <FormRow label="Food type" htmlFor="product-food-type">
                <RadioGroup className="flex gap-4" value={form.foodType} onValueChange={(v) => setForm((f) => ({ ...f, foodType: v as typeof f.foodType }))}>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="VEG" /> Veg
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="NON_VEG" /> Non-veg
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="EGG" /> Egg
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="NA" /> N/A
                  </label>
                </RadioGroup>
              </FormRow>
            )}
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <FormRow label="Selling price" htmlFor="product-price" required>
              <Input id="product-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </FormRow>

            {itemSettings.mrpEnabled && (
              <FormRow label="MRP" htmlFor="product-mrp" description="Reference retail price — never auto-charged as the selling price">
                <Input id="product-mrp" type="number" min={0} step="0.01" value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} placeholder="Optional" />
              </FormRow>
            )}

            {itemSettings.purchasePriceEnabled && (
              <FormRow label="Purchase price" htmlFor="product-cost-price" description="Owner-only — never shown to customers">
                <Input
                  id="product-cost-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                  placeholder="Optional"
                />
              </FormRow>
            )}

            {itemSettings.wholesalePriceEnabled && (
              <FormRow label="Wholesale price" htmlFor="product-wholesale-price" description="Used automatically for Wholesale-category parties">
                <Input
                  id="product-wholesale-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.wholesalePrice}
                  onChange={(e) => setForm((f) => ({ ...f, wholesalePrice: e.target.value }))}
                  placeholder="Optional"
                />
              </FormRow>
            )}

            {(() => {
              const sellingNum = Number(form.price);
              const costNum = form.costPrice.trim() === "" ? null : Number(form.costPrice);
              const mrpNum = form.mrp.trim() === "" ? null : Number(form.mrp);
              const validSelling = Number.isFinite(sellingNum) && sellingNum > 0;
              const validCost = costNum !== null && Number.isFinite(costNum);
              const { profit, profitPercent } = validSelling && validCost ? computeUnitProfit(sellingNum, costNum) : { profit: null, profitPercent: null };
              const showsMrpWarning = validSelling && mrpNum !== null && Number.isFinite(mrpNum) && sellingNum > mrpNum;
              if (profit === null && !showsMrpWarning) return null;
              return (
                <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-1 text-sm">
                  {profit !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Profit per item</span>
                      <span className={cn("font-semibold", profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                        {formatCurrency(profit, currency)} {profitPercent !== null && `(${profitPercent}%)`}
                      </span>
                    </div>
                  )}
                  {showsMrpWarning && (
                    <p className="text-amber-600 dark:text-amber-400 text-xs">
                      Selling price is above MRP — this is allowed, just double-check it&apos;s intentional.
                    </p>
                  )}
                </div>
              );
            })()}

            {itemSettings.partyPricingEnabled && product && (
              <FormRow label="Party-wise price" htmlFor="product-party-prices" description="Set a different selling price for specific customers/parties">
                <ProductPartyPrices productId={product.id} parties={parties} currency={currency} />
              </FormRow>
            )}
            {itemSettings.partyPricingEnabled && !product && (
              <p className="text-xs text-muted-foreground rounded-xl border bg-muted/30 px-4 py-3">
                Save this product first, then come back here to set party-wise prices.
              </p>
            )}
          </TabsContent>

          <TabsContent value="inventory" className="space-y-4">
            <FormRow label="Unit" htmlFor="product-unit" required description="e.g. plate, kg, pc">
              <Input id="product-unit" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </FormRow>

            {itemSettings.stockEnabled && (
              <FormRow label="Stock" htmlFor="product-stock" description="Leave blank for unlimited">
                <Input id="product-stock" type="number" min={0} value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} />
              </FormRow>
            )}

            {itemSettings.batchNumberEnabled && (
              <FormRow label="Batch number" htmlFor="product-batch" description="Current/opening batch — future purchases can use their own batch">
                <Input id="product-batch" value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} />
              </FormRow>
            )}

            {itemSettings.serialNumberEnabled && (
              <FormRow label="Serial number" htmlFor="product-serial">
                <Input id="product-serial" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              </FormRow>
            )}

            {!itemSettings.stockEnabled && !itemSettings.batchNumberEnabled && !itemSettings.serialNumberEnabled && (
              <p className="text-xs text-muted-foreground">Turn on Stock, Batch number, or Serial number in Item Settings to track inventory here.</p>
            )}
          </TabsContent>

          <TabsContent value="barcode" className="space-y-4">
            {itemSettings.barcodeEnabled ? (
              <FormRow label="Barcode" htmlFor="product-barcode" description="Scan or type — used to find this item while taking orders">
                <div className="flex gap-2">
                  <Input id="product-barcode" value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="e.g. 8901030895556" />
                  <BarcodeScanButton onDetect={(code) => setForm((f) => ({ ...f, barcode: code }))} />
                </div>
              </FormRow>
            ) : (
              <p className="text-xs text-muted-foreground">Turn on Barcode in Item Settings to scan or enter one here.</p>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            {itemSettings.hsnEnabled && (
              <FormRow label="HSN code" htmlFor="product-hsn" required={itemSettings.hsnRequired} description="Shown on invoices and GST reports">
                <Input id="product-hsn" value={form.hsnCode} onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))} />
              </FormRow>
            )}

            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium select-none">Combo item</p>
              <Switch checked={form.isCombo} onCheckedChange={(v) => setForm((f) => ({ ...f, isCombo: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <div>
                <p className="text-sm font-medium select-none">Active</p>
                <p className="text-xs text-muted-foreground">Inactive products can&apos;t be newly ordered, but stay visible on past orders.</p>
              </div>
              <Switch checked={form.isAvailable} onCheckedChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium select-none">Visible to customers</p>
              <Switch checked={form.isVisible} onCheckedChange={(v) => setForm((f) => ({ ...f, isVisible: v }))} />
            </div>
          </TabsContent>

          <TabsContent value="offer" className="space-y-4">
            {itemSettings.offerEnabled ? (
              <>
                <FormRow label="Offer type" htmlFor="product-offer-type">
                  <RadioGroup className="flex gap-4" value={form.offerType} onValueChange={(v) => setForm((f) => ({ ...f, offerType: v as typeof f.offerType }))}>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="NONE" /> None
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="PERCENTAGE" /> Percentage %
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="FLAT" /> Flat ₹
                    </label>
                  </RadioGroup>
                </FormRow>

                {form.offerType !== "NONE" && (
                  <FormRow label="Offer value" htmlFor="product-offer-value">
                    <Input
                      id="product-offer-value"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.offerValue}
                      onChange={(e) => setForm((f) => ({ ...f, offerValue: e.target.value }))}
                      placeholder={form.offerType === "PERCENTAGE" ? "e.g. 10" : "e.g. 50"}
                    />
                  </FormRow>
                )}

                {(() => {
                  const sellingNum = Number(form.price);
                  if (form.offerType === "NONE" || !Number.isFinite(sellingNum) || sellingNum <= 0) return null;
                  const offerValueNum = Number(form.offerValue);
                  if (!Number.isFinite(offerValueNum) || offerValueNum <= 0) return null;
                  const result = applyOffer(sellingNum, form.offerType, offerValueNum);
                  return (
                    <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Original price</span>
                        <span className="line-through text-muted-foreground">{formatCurrency(result.originalPrice, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Offer</span>
                        <span className="text-emerald-600 dark:text-emerald-400">-{formatCurrency(result.discountAmount, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between font-semibold">
                        <span>Final price</span>
                        <span>{formatCurrency(result.finalPrice, currency)}</span>
                      </div>
                    </div>
                  );
                })()}

                <FormRow label="Badge text (optional)" htmlFor="product-offer-note" description='Short label shown alongside the offer, e.g. "Buy 1 Get 1"'>
                  <Input id="product-offer-note" value={form.offerNote} onChange={(e) => setForm((f) => ({ ...f, offerNote: e.target.value }))} />
                </FormRow>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Turn on Offer in Item Settings to set a discount on this product.</p>
            )}
          </TabsContent>
        </main>
      </Tabs>

      <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2 border-t bg-background/98 px-4 py-3 backdrop-blur-sm">
        <Button variant="outline" onClick={goBack} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save product"}
        </Button>
      </div>
    </div>
  );
}
