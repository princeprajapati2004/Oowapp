"use client";

import { useMemo, useRef, useState } from "react";
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
  MoreVertical,
  Eye,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProductDetailsSheet } from "@/components/admin/product-details-sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { computeUnitProfit } from "@/lib/services/profit";
import { cn } from "@/lib/utils";
import type { Category } from "@/generated/prisma/client";
import type { listProducts } from "@/lib/services/product";
import type { serializeProductsWithCost } from "@/lib/serialize";
import type { ItemSettingsInput } from "@/lib/validation/item-settings";

export type ProductRow = ReturnType<typeof serializeProductsWithCost<Awaited<ReturnType<typeof listProducts>>[number]>>[number];
type ItemSettings = ItemSettingsInput;

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
type StatusFilter = "all" | "active" | "inactive";

const LOW_STOCK_THRESHOLD = 5;

export function ProductsManager({
  initialProducts,
  categories,
  currency,
  itemSettings,
}: {
  initialProducts: ProductRow[];
  categories: Category[];
  currency: string;
  itemSettings: ItemSettings;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const viewingProduct = products.find((p) => p.id === viewingProductId) ?? null;

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

  function openCreate() {
    router.push("/admin/products/new");
  }

  function openEdit(product: ProductRow) {
    router.push(`/admin/products/${product.id}/edit`);
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
                        <Tooltip>
                          <TooltipTrigger className="block w-full min-w-0 text-left">
                            <p className="font-medium leading-tight text-sm truncate">{product.name}</p>
                          </TooltipTrigger>
                          <TooltipContent>{product.name}</TooltipContent>
                        </Tooltip>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="More product options"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreVertical className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewingProductId(product.id)}>
                          <Eye className="size-3.5" /> View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(product)}>
                          <Pencil className="size-3.5" /> Edit product
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(product)}>
                          <Copy className="size-3.5" /> Duplicate product
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleAvailable(product)}>
                          <Power className="size-3.5" /> {product.isAvailable ? "Disable" : "Enable"} product
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => handleDeleteRequest(product)}>
                          <Trash2 className="size-3.5" /> Delete product
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete product?"
        description={`"${deleteTarget?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />

      <ProductDetailsSheet
        product={viewingProduct}
        onOpenChange={(open) => !open && setViewingProductId(null)}
        currency={currency}
        itemSettings={itemSettings}
        onEdit={(product) => {
          setViewingProductId(null);
          openEdit(product);
        }}
        onDuplicate={handleDuplicate}
        onToggleAvailable={handleToggleAvailable}
        onDeleteRequest={(product) => {
          setViewingProductId(null);
          handleDeleteRequest(product);
        }}
      />
    </div>
  );
}
