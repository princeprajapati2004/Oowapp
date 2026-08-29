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
  Copy,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ImageUploader } from "@/components/shared/image-uploader";
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
import type { serializeProductsWithCost } from "@/lib/serialize";
import type { ItemSettingsInput } from "@/lib/validation/item-settings";

type ProductRow = ReturnType<typeof serializeProductsWithCost<Awaited<ReturnType<typeof listProducts>>[number]>>[number];
type ItemSettings = ItemSettingsInput;
type PartyOption = { id: string; name: string; phone: string };

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
type StatusFilter = "all" | "active" | "inactive";

const LOW_STOCK_THRESHOLD = 5;

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  costPrice: "",
  mrp: "",
  wholesalePrice: "",
  categoryId: "",
  imageUrl: null as string | null,
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

export function ProductsManager({
  initialProducts,
  categories,
  currency,
  businessType,
  itemSettings,
  parties,
}: {
  initialProducts: ProductRow[];
  categories: Category[];
  currency: string;
  businessType: BusinessType;
  itemSettings: ItemSettings;
  parties: PartyOption[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("basic");
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
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        (product.description ?? "").toLowerCase().includes(q) ||
        (product.barcode ?? "").toLowerCase() === search.toLowerCase() ||
        (product.productCode ?? "").toLowerCase() === search.toLowerCase();
      const matchesCategory = categoryFilter === "all" || product.categoryId === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && product.isAvailable) ||
        (statusFilter === "inactive" && !product.isAvailable);
      const stock = product.stock;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "out_of_stock" && stock !== null && stock !== undefined && stock <= 0) ||
        (stockFilter === "low_stock" && stock !== null && stock !== undefined && stock > 0 && stock <= LOW_STOCK_THRESHOLD) ||
        (stockFilter === "in_stock" && (stock === null || stock === undefined || stock > LOW_STOCK_THRESHOLD));
      return matchesSearch && matchesCategory && matchesStatus && matchesStock;
    });
  }, [products, search, categoryFilter, statusFilter, stockFilter]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" });
    setCategorySearch("");
    setActiveTab("basic");
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
      wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : "",
      categoryId: product.categoryId,
      imageUrl: product.imageUrl,
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
    });
    setCategorySearch("");
    setActiveTab("basic");
    setDialogOpen(true);
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
          wholesalePrice: updated.wholesalePrice == null ? null : Number(updated.wholesalePrice),
          offerValue: updated.offerValue == null ? null : Number(updated.offerValue),
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
          wholesalePrice: created.wholesalePrice == null ? null : Number(created.wholesalePrice),
          offerValue: created.offerValue == null ? null : Number(created.offerValue),
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

  async function handleDuplicate(product: ProductRow) {
    try {
      const created = await api.post<Awaited<ReturnType<typeof listProducts>>[number]>(
        `/api/admin/products/${product.id}/duplicate`
      );
      const serialized = {
        ...created,
        price: Number(created.price),
        costPrice: created.costPrice == null ? null : Number(created.costPrice),
        mrp: created.mrp == null ? null : Number(created.mrp),
        wholesalePrice: created.wholesalePrice == null ? null : Number(created.wholesalePrice),
        offerValue: created.offerValue == null ? null : Number(created.offerValue),
      } as ProductRow;
      setProducts((prev) => [...prev, serialized]);
      toast.success(`Duplicated as "${serialized.name}"`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to duplicate");
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="flex flex-1 gap-2 min-w-0">
              <div className="relative flex-1 min-w-[10rem]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products, barcode, code…"
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
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as StatusFilter) ?? "all")}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue>
                    {statusFilter === "all" ? "All status" : statusFilter === "active" ? "Active" : "Inactive"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {itemSettings.stockEnabled && (
                <Select value={stockFilter} onValueChange={(v) => setStockFilter((v as StockFilter) ?? "all")}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue>
                      {stockFilter === "all"
                        ? "All stock"
                        : stockFilter === "in_stock"
                          ? "In stock"
                          : stockFilter === "low_stock"
                            ? "Low stock"
                            : "Out of stock"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stock</SelectItem>
                    <SelectItem value="in_stock">In stock</SelectItem>
                    <SelectItem value="low_stock">Low stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of stock</SelectItem>
                  </SelectContent>
                </Select>
              )}
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
                      <div className="min-w-0">
                        <p className="font-medium leading-tight text-sm truncate">{product.name}</p>
                        {product.productCode && (
                          <p className="text-[11px] text-muted-foreground truncate">{product.productCode}</p>
                        )}
                      </div>
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
                      {product.mrp != null && (
                        <Badge variant="outline" className="text-xs">MRP {formatCurrency(product.mrp, currency)}</Badge>
                      )}
                      {!product.isAvailable && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      {itemSettings.stockEnabled && product.isAvailable && product.stock !== null && product.stock !== undefined && product.stock <= LOW_STOCK_THRESHOLD && product.stock > 0 && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">Low stock ({product.stock})</Badge>
                      )}
                      {itemSettings.stockEnabled && product.isAvailable && product.stock !== null && product.stock !== undefined && product.stock === 0 && (
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
                        aria-label={product.isAvailable ? "Mark inactive" : "Mark active"}
                      />
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(product)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDuplicate(product)} aria-label="Duplicate" className="text-muted-foreground hover:text-foreground">
                      <Copy className="size-3.5" />
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

          <Tabs
            value={activeTab}
            onValueChange={(v) => v && setActiveTab(v as TabId)}
            className="flex-1 min-h-0 flex flex-col"
          >
            <div className="flex-shrink-0 border-b px-5 pt-2 overflow-x-auto">
              <TabsList variant="line">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    {TAB_LABELS[tab]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <TabsContent value="basic" className="space-y-4">
                {itemSettings.productImageEnabled && (
                  <FormRow label="Image" htmlFor="product-image">
                    <ImageUploader value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} />
                  </FormRow>
                )}

                <FormRow label="Name" htmlFor="product-name" required>
                  <Input
                    id="product-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
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

                {itemSettings.productTypeEnabled && (
                  <FormRow label="Item/Product type" htmlFor="product-type" description="e.g. Product, Service, Raw Material">
                    <Input
                      id="product-type"
                      value={form.productType}
                      onChange={(e) => setForm((f) => ({ ...f, productType: e.target.value }))}
                    />
                  </FormRow>
                )}

                {itemSettings.descriptionEnabled && (
                  <FormRow label="Description" htmlFor="product-description">
                    <Textarea
                      id="product-description"
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </FormRow>
                )}

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
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4">
                <FormRow label="Selling price" htmlFor="product-price" required>
                  <Input
                    id="product-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  />
                </FormRow>

                {itemSettings.mrpEnabled && (
                  <FormRow label="MRP" htmlFor="product-mrp" description="Reference retail price — never auto-charged as the selling price">
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

                {itemSettings.partyPricingEnabled && editing && (
                  <FormRow label="Party-wise price" htmlFor="product-party-prices" description="Set a different selling price for specific customers/parties">
                    <ProductPartyPrices productId={editing.id} parties={parties} currency={currency} />
                  </FormRow>
                )}
                {itemSettings.partyPricingEnabled && !editing && (
                  <p className="text-xs text-muted-foreground rounded-xl border bg-muted/30 px-4 py-3">
                    Save this product first, then come back here to set party-wise prices.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="inventory" className="space-y-4">
                <FormRow label="Unit" htmlFor="product-unit" required description="e.g. plate, kg, pc">
                  <Input
                    id="product-unit"
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  />
                </FormRow>

                {itemSettings.stockEnabled && (
                  <FormRow label="Stock" htmlFor="product-stock" description="Leave blank for unlimited">
                    <Input
                      id="product-stock"
                      type="number"
                      min={0}
                      value={form.stock}
                      onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    />
                  </FormRow>
                )}

                {itemSettings.batchNumberEnabled && (
                  <FormRow label="Batch number" htmlFor="product-batch" description="Current/opening batch — future purchases can use their own batch">
                    <Input
                      id="product-batch"
                      value={form.batchNumber}
                      onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))}
                    />
                  </FormRow>
                )}

                {itemSettings.serialNumberEnabled && (
                  <FormRow label="Serial number" htmlFor="product-serial">
                    <Input
                      id="product-serial"
                      value={form.serialNumber}
                      onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                    />
                  </FormRow>
                )}

                {!itemSettings.stockEnabled && !itemSettings.batchNumberEnabled && !itemSettings.serialNumberEnabled && (
                  <p className="text-xs text-muted-foreground">
                    Turn on Stock, Batch number, or Serial number in Item Settings to track inventory here.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="barcode" className="space-y-4">
                {itemSettings.barcodeEnabled ? (
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
                ) : (
                  <p className="text-xs text-muted-foreground">Turn on Barcode in Item Settings to scan or enter one here.</p>
                )}
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4">
                {itemSettings.hsnEnabled && (
                  <FormRow label="HSN code" htmlFor="product-hsn" required={itemSettings.hsnRequired} description="Shown on invoices and GST reports">
                    <Input
                      id="product-hsn"
                      value={form.hsnCode}
                      onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))}
                    />
                  </FormRow>
                )}

                <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
                  <p className="text-sm font-medium select-none">Combo item</p>
                  <Switch
                    checked={form.isCombo}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isCombo: v }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
                  <div>
                    <p className="text-sm font-medium select-none">Active</p>
                    <p className="text-xs text-muted-foreground">Inactive products can&apos;t be newly ordered, but stay visible on past orders.</p>
                  </div>
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
              </TabsContent>

              <TabsContent value="offer" className="space-y-4">
                {itemSettings.offerEnabled ? (
                  <>
                    <FormRow label="Offer type" htmlFor="product-offer-type">
                      <RadioGroup
                        className="flex gap-4"
                        value={form.offerType}
                        onValueChange={(v) => setForm((f) => ({ ...f, offerType: v as typeof f.offerType }))}
                      >
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
                      <Input
                        id="product-offer-note"
                        value={form.offerNote}
                        onChange={(e) => setForm((f) => ({ ...f, offerNote: e.target.value }))}
                      />
                    </FormRow>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Turn on Offer in Item Settings to set a discount on this product.</p>
                )}
              </TabsContent>
            </div>
          </Tabs>

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
