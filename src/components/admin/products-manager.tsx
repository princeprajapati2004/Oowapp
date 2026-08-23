"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  LayoutGrid,
  List as ListIcon,
  UtensilsCrossed,
  ImageOff,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ImageUploader } from "@/components/shared/image-uploader";
import { BarcodeScanButton } from "@/components/admin/barcode-scan-button";
import { api, ApiError } from "@/lib/api-client";
import { isFoodBusiness, type BusinessType } from "@/lib/business-types";
import { formatCurrency } from "@/lib/utils/currency";
import { computeUnitProfit } from "@/lib/services/profit";
import { cn } from "@/lib/utils";
import type { Category } from "@/generated/prisma/client";
import type { listProducts } from "@/lib/services/product";
import type { serializeProductsWithCost } from "@/lib/serialize";

type ProductRow = ReturnType<typeof serializeProductsWithCost<Awaited<ReturnType<typeof listProducts>>[number]>>[number];

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  costPrice: "",
  mrp: "",
  categoryId: "",
  imageUrl: null as string | null,
  unit: "",
  barcode: "",
  foodType: "NA" as "VEG" | "NON_VEG" | "EGG" | "NA",
  isCombo: false,
  offerNote: "",
  isAvailable: true,
  isVisible: true,
  stock: "" as string,
};

export function ProductsManager({
  initialProducts,
  categories,
  currency,
  businessType,
}: {
  initialProducts: ProductRow[];
  categories: Category[];
  currency: string;
  businessType: BusinessType;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);

  // Category search
  const [categorySearch, setCategorySearch] = useState("");

  // Undo delete
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !search ||
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        (product.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (product.barcode ?? "").toLowerCase() === search.toLowerCase();
      const matchesCategory = categoryFilter === "all" || product.categoryId === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" });
    setCategorySearch("");
    setDialogOpen(true);
  }

  // Launched from the Quick Actions FAB ("Add Product" → /admin/products?new=1)
  // — opens the same add dialog a manual "Add product" click would. Read via
  // location.search (not useSearchParams) so this page doesn't need a
  // Suspense boundary just for this one-shot check.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openCreate();
    router.replace("/admin/products", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(product: ProductRow) {
    setEditing(product);
    setForm({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      costPrice: product.costPrice != null ? String(product.costPrice) : "",
      mrp: product.mrp != null ? String(product.mrp) : "",
      categoryId: product.categoryId,
      imageUrl: product.imageUrl,
      unit: product.unit ?? "",
      barcode: product.barcode ?? "",
      foodType: product.foodType,
      isCombo: product.isCombo,
      offerNote: product.offerNote ?? "",
      isAvailable: product.isAvailable,
      isVisible: product.isVisible,
      stock: product.stock === null || product.stock === undefined ? "" : String(product.stock),
    });
    setCategorySearch("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.categoryId) return toast.error("Select a category");
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return toast.error("Enter a valid price");
    const costPriceNum = form.costPrice.trim() === "" ? null : Number(form.costPrice);
    if (costPriceNum !== null && (!Number.isFinite(costPriceNum) || costPriceNum < 0)) {
      return toast.error("Enter a valid purchase price");
    }
    const mrpNum = form.mrp.trim() === "" ? null : Number(form.mrp);
    if (mrpNum !== null && (!Number.isFinite(mrpNum) || mrpNum < 0)) {
      return toast.error("Enter a valid MRP");
    }

    const payload = {
      name: form.name,
      description: form.description,
      price: priceNum,
      costPrice: costPriceNum,
      mrp: mrpNum,
      categoryId: form.categoryId,
      imageUrl: form.imageUrl,
      unit: form.unit,
      barcode: form.barcode,
      foodType: form.foodType,
      isCombo: form.isCombo,
      offerNote: form.offerNote,
      isAvailable: form.isAvailable,
      isVisible: form.isVisible,
      stock: form.stock === "" ? null : Number(form.stock),
      sortOrder: editing?.sortOrder ?? products.length,
    };

    setSaving(true);
    try {
      if (editing) {
        const updated = await api.patch<Awaited<ReturnType<typeof listProducts>>[number]>(
          `/api/admin/products/${editing.id}`,
          payload
        );
        const serialized = {
          ...updated,
          price: Number(updated.price),
          costPrice: updated.costPrice == null ? null : Number(updated.costPrice),
          mrp: updated.mrp == null ? null : Number(updated.mrp),
        } as ProductRow;
        setProducts((prev) => prev.map((p) => (p.id === serialized.id ? serialized : p)));
        toast.success("Product updated");
      } else {
        const created = await api.post<Awaited<ReturnType<typeof listProducts>>[number]>(
          "/api/admin/products",
          payload
        );
        const serialized = {
          ...created,
          price: Number(created.price),
          costPrice: created.costPrice == null ? null : Number(created.costPrice),
          mrp: created.mrp == null ? null : Number(created.mrp),
        } as ProductRow;
        setProducts((prev) => [...prev, serialized]);
        toast.success("Product added");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAvailable(product: ProductRow) {
    const prev = [...products];
    const next = !product.isAvailable;
    setProducts((p) => p.map((x) => (x.id === product.id ? { ...x, isAvailable: next } : x)));
    try {
      await api.patch(`/api/admin/products/${product.id}`, { isAvailable: next });
    } catch (error) {
      setProducts(prev);
      toast.error(error instanceof ApiError ? error.message : "Failed to update");
    }
  }

  function handleDeleteRequest(product: ProductRow) {
    setDeleteTarget(product);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const targetProduct = deleteTarget;
    const previousProducts = [...products];

    // Optimistic: remove immediately
    setProducts((prev) => prev.filter((p) => p.id !== targetProduct.id));
    setDeleteTarget(null);

    // Show undo toast — actual delete fires after the toast duration
    const timerId = setTimeout(async () => {
      try {
        await api.delete(`/api/admin/products/${targetProduct.id}`);
      } catch (error) {
        // Restore on failure
        setProducts(previousProducts);
        toast.error(error instanceof ApiError ? error.message : "Failed to delete product");
      }
    }, 5000);

    deleteTimerRef.current = timerId;

    toast("Product deleted", {
      description: `"${targetProduct.name}" removed.`,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timerId);
          deleteTimerRef.current = null;
          setProducts(previousProducts);
          toast.success("Delete undone");
        },
      },
      duration: 5000,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Everything customers can order.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/admin/menu-import" />} nativeButton={false}>
            <FileSpreadsheet className="size-4" /> Bulk Import
          </Button>
          <Button onClick={openCreate} disabled={categories.length === 0}>
            <Plus className="size-4" /> Add product
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Add a category first"
          description="Products need a category. Head to Categories to create one, then come back here."
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="pl-9 h-9 bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
                />
              </div>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue>
                    {categoryFilter === "all" ? "All categories" : (categories.find((c) => c.id === categoryFilter)?.name ?? "All categories")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5">
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setView("grid")}
                aria-label="Grid view"
                className={view === "grid" ? "shadow-sm" : ""}
              >
                <LayoutGrid className="size-3.5" />
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setView("list")}
                aria-label="List view"
                className={view === "list" ? "shadow-sm" : ""}
              >
                <ListIcon className="size-3.5" />
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="No products found"
              description="Try a different search or add your first product."
              action={<Button onClick={openCreate}>Add product</Button>}
            />
          ) : (
            <div
              className={cn(
                view === "grid"
                  ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  : "overflow-hidden rounded-xl border bg-card divide-y"
              )}
            >
              {filtered.map((product) => (
                <div
                  key={product.id}
                  className={cn(
                    view === "grid"
                      ? "rounded-xl border bg-card overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                      : "flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  )}
                >
                  <div
                    className={cn(
                      "relative overflow-hidden bg-muted shrink-0",
                      view === "grid" ? "h-36 w-full" : "size-12 rounded-lg"
                    )}
                  >
                    {product.imageUrl ? (
                      <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <ImageOff className="size-4 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className={cn("flex-1 min-w-0", view === "grid" && "p-3 space-y-1.5")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight text-sm truncate">{product.name}</p>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-sm">{formatCurrency(product.price, currency)}</p>
                        {product.costPrice != null && (() => {
                          const { profit, profitPercent } = computeUnitProfit(product.price, product.costPrice);
                          return profit === null ? null : (
                            <p className={cn("text-[11px]", profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                              +{formatCurrency(profit, currency)} {profitPercent !== null && `(${profitPercent}%)`}
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{product.category.name}</Badge>
                      {!product.isAvailable && <Badge variant="destructive" className="text-xs">Out of stock</Badge>}
                      {product.isAvailable && product.stock !== null && product.stock !== undefined && product.stock <= 5 && product.stock > 0 && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">Low stock ({product.stock})</Badge>
                      )}
                      {product.isAvailable && product.stock !== null && product.stock !== undefined && product.stock === 0 && (
                        <Badge variant="destructive" className="text-xs">Stock: 0</Badge>
                      )}
                      {!product.isVisible && <Badge variant="outline" className="text-xs">Hidden</Badge>}
                    </div>
                  </div>
                  <div className={cn("flex items-center gap-1.5 shrink-0", view === "grid" && "px-3 pb-3")}>
                    {view === "list" && (
                      <Switch
                        checked={product.isAvailable}
                        onCheckedChange={() => handleToggleAvailable(product)}
                        aria-label={product.isAvailable ? "Mark out of stock" : "Mark available"}
                      />
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(product)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDeleteRequest(product)}
                      aria-label="Delete"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Centered product form dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex flex-col p-0 gap-0 sm:max-w-xl max-h-[92dvh] overflow-hidden">
          <DialogHeader className="flex-shrink-0 px-5 py-4 border-b">
            <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <FormRow label="Image" htmlFor="product-image">
              <ImageUploader value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} />
            </FormRow>

            <FormRow label="Name" htmlFor="product-name" required>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FormRow>

            <FormRow label="Description" htmlFor="product-description">
              <Textarea
                id="product-description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormRow>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Price" htmlFor="product-price" required>
                <Input
                  id="product-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Unit" htmlFor="product-unit" description="e.g. plate, kg, pc">
                <Input
                  id="product-unit"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                />
              </FormRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
              <FormRow label="MRP" htmlFor="product-mrp" description="Owner-only — never shown to customers">
                <Input
                  id="product-mrp"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.mrp}
                  onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))}
                  placeholder="Optional"
                />
              </FormRow>
            </div>

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

            <FormRow label="Barcode" htmlFor="product-barcode" description="Scan or type — used to find this item while taking orders">
              <div className="flex gap-2">
                <Input
                  id="product-barcode"
                  value={form.barcode}
                  onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  placeholder="e.g. 8901030895556"
                />
                <BarcodeScanButton onDetect={(code) => setForm((f) => ({ ...f, barcode: code }))} />
              </div>
            </FormRow>

            <FormRow label="Category" htmlFor="product-category" required>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v ?? "" }))}>
                <SelectTrigger id="product-category" className="w-full">
                  <SelectValue>
                    {categories.find((c) => c.id === form.categoryId)?.name ?? "Select category"}
                  </SelectValue>
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

            {isFoodBusiness(businessType) && (
              <FormRow label="Food type" htmlFor="product-food-type">
                <RadioGroup
                  className="flex gap-4"
                  value={form.foodType}
                  onValueChange={(v) => setForm((f) => ({ ...f, foodType: v as typeof f.foodType }))}
                >
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

            <FormRow label="Stock (optional)" htmlFor="product-stock" description="Leave blank for unlimited">
              <Input
                id="product-stock"
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
            </FormRow>

            <FormRow label="Offer (optional)" htmlFor="product-offer" description='e.g. "20% off" or "Buy 1 Get 1"'>
              <Input
                id="product-offer"
                value={form.offerNote}
                onChange={(e) => setForm((f) => ({ ...f, offerNote: e.target.value }))}
              />
            </FormRow>

            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium select-none">Combo item</p>
              <Switch
                checked={form.isCombo}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isCombo: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium select-none">Available</p>
              <Switch
                checked={form.isAvailable}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium select-none">Visible to customers</p>
              <Switch
                checked={form.isVisible}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isVisible: v }))}
              />
            </div>
          </div>

          <div className="flex-shrink-0 border-t bg-muted/50 px-5 py-4 flex justify-end gap-2 rounded-b-xl">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete product?"
        description={`"${deleteTarget?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
