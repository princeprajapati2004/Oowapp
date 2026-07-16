"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ImageUploader } from "@/components/shared/image-uploader";
import { api, ApiError } from "@/lib/api-client";
import { isFoodBusiness, type BusinessType } from "@/lib/business-types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { Category } from "@/generated/prisma/client";
import type { listProducts } from "@/lib/services/product";
import type { serializeProducts } from "@/lib/serialize";

type ProductRow = ReturnType<typeof serializeProducts<Awaited<ReturnType<typeof listProducts>>[number]>>[number];

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  imageUrl: null as string | null,
  unit: "",
  foodType: "NA" as "VEG" | "NON_VEG" | "NA",
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
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);

  const filtered = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !search ||
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        (product.description ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || product.categoryId === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" });
    setSheetOpen(true);
  }

  function openEdit(product: ProductRow) {
    setEditing(product);
    setForm({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      categoryId: product.categoryId,
      imageUrl: product.imageUrl,
      unit: product.unit ?? "",
      foodType: product.foodType,
      isAvailable: product.isAvailable,
      isVisible: product.isVisible,
      stock: product.stock === null || product.stock === undefined ? "" : String(product.stock),
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.categoryId) return toast.error("Select a category");
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return toast.error("Enter a valid price");

    const payload = {
      name: form.name,
      description: form.description,
      price: priceNum,
      categoryId: form.categoryId,
      imageUrl: form.imageUrl,
      unit: form.unit,
      foodType: form.foodType,
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
        const serialized = { ...updated, price: Number(updated.price) } as ProductRow;
        setProducts((prev) => prev.map((p) => (p.id === serialized.id ? serialized : p)));
        toast.success("Product updated");
      } else {
        const created = await api.post<Awaited<ReturnType<typeof listProducts>>[number]>(
          "/api/admin/products",
          payload
        );
        const serialized = { ...created, price: Number(created.price) } as ProductRow;
        setProducts((prev) => [...prev, serialized]);
        toast.success("Product added");
      }
      setSheetOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/products/${deleteTarget.id}`);
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success("Product deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Everything customers can order.</p>
        </div>
        <Button onClick={openCreate} disabled={categories.length === 0}>
          <Plus className="size-4" /> Add product
        </Button>
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
                      <p className="shrink-0 font-semibold text-sm">{formatCurrency(product.price, currency)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{product.category.name}</Badge>
                      {!product.isAvailable && <Badge variant="destructive" className="text-xs">Out of stock</Badge>}
                      {!product.isVisible && <Badge variant="outline" className="text-xs">Hidden</Badge>}
                    </div>
                  </div>
                  <div className={cn("flex items-center gap-0.5 shrink-0", view === "grid" && "px-3 pb-3")}>
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(product)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(product)}
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit product" : "Add product"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
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

            <FormRow label="Category" htmlFor="product-category" required>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v ?? "" }))}>
                <SelectTrigger id="product-category" className="w-full">
                  <SelectValue>
                    {categories.find((c) => c.id === form.categoryId)?.name ?? "Select category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
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
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save product"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete product?"
        description={`"${deleteTarget?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
