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
}: {
  initialProducts: ProductRow[];
  categories: Category[];
  currency: string;
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
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
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
            <div className="flex items-center justify-end gap-1">
              <Button
                variant={view === "grid" ? "default" : "ghost"}
                size="icon"
                onClick={() => setView("grid")}
                aria-label="Grid view"
              >
                <LayoutGrid className="size-4" />
              </Button>
              <Button
                variant={view === "list" ? "default" : "ghost"}
                size="icon"
                onClick={() => setView("list")}
                aria-label="List view"
              >
                <ListIcon className="size-4" />
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
                  : "flex flex-col gap-2"
              )}
            >
              {filtered.map((product) => (
                <div
                  key={product.id}
                  className={cn(
                    "rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm",
                    view === "list" && "flex items-center gap-3"
                  )}
                >
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-lg bg-muted",
                      view === "grid" ? "mb-3 h-32 w-full" : "size-14 shrink-0"
                    )}
                  >
                    {product.imageUrl ? (
                      <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <ImageOff className="size-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className={cn("flex-1", view === "grid" && "space-y-1")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{product.name}</p>
                      <p className="shrink-0 font-semibold">{formatCurrency(product.price, currency)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{product.category.name}</Badge>
                      {!product.isAvailable && <Badge variant="destructive">Out of stock</Badge>}
                      {!product.isVisible && <Badge variant="outline">Hidden</Badge>}
                    </div>
                  </div>
                  <div className={cn("flex gap-1", view === "grid" && "mt-2 justify-end")}>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(product)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(product)}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-4 text-destructive" />
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
                  <SelectValue />
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

            <FormRow label="Stock (optional)" htmlFor="product-stock" description="Leave blank for unlimited">
              <Input
                id="product-stock"
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
            </FormRow>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">Available</p>
              <Switch
                checked={form.isAvailable}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">Visible to customers</p>
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
