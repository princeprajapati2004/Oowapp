"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import type { Category, Product } from "@/generated/prisma/client";
import type { listCoupons } from "@/lib/services/coupon";
import type { serializeCoupons } from "@/lib/serialize";

type CouponRow = ReturnType<typeof serializeCoupons<Awaited<ReturnType<typeof listCoupons>>[number]>>[number];

type FilterTab = "ALL" | "ACTIVE" | "EXPIRED" | "DISABLED";

const EMPTY_FORM = {
  code: "",
  description: "",
  discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
  discountValue: "",
  maxDiscountAmount: "",
  minOrderAmount: "",
  totalUsageLimit: "",
  perCustomerLimit: "",
  startsAt: "",
  expiresAt: "",
  isEnabled: true,
  categoryIds: [] as string[],
  productIds: [] as string[],
};

function toDateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function couponStatus(coupon: CouponRow): "ACTIVE" | "EXPIRED" | "DISABLED" | "SCHEDULED" {
  if (!coupon.isEnabled) return "DISABLED";
  const now = Date.now();
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return "EXPIRED";
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return "SCHEDULED";
  return "ACTIVE";
}

export function CouponManager({
  initialCoupons,
  categories,
  products,
  currency,
}: {
  initialCoupons: CouponRow[];
  categories: Category[];
  products: Product[];
  currency: string;
}) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CouponRow | null>(null);

  const filtered = useMemo(() => {
    if (filter === "ALL") return coupons;
    if (filter === "DISABLED") return coupons.filter((c) => couponStatus(c) === "DISABLED");
    if (filter === "EXPIRED") return coupons.filter((c) => couponStatus(c) === "EXPIRED");
    return coupons.filter((c) => couponStatus(c) === "ACTIVE" || couponStatus(c) === "SCHEDULED");
  }, [coupons, filter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(coupon: CouponRow) {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description ?? "",
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      maxDiscountAmount: coupon.maxDiscountAmount != null ? String(coupon.maxDiscountAmount) : "",
      minOrderAmount: coupon.minOrderAmount != null ? String(coupon.minOrderAmount) : "",
      totalUsageLimit: coupon.totalUsageLimit != null ? String(coupon.totalUsageLimit) : "",
      perCustomerLimit: coupon.perCustomerLimit != null ? String(coupon.perCustomerLimit) : "",
      startsAt: toDateInputValue(coupon.startsAt),
      expiresAt: toDateInputValue(coupon.expiresAt),
      isEnabled: coupon.isEnabled,
      categoryIds: coupon.categories.map((c) => c.categoryId),
      productIds: coupon.products.map((p) => p.productId),
    });
    setDialogOpen(true);
  }

  function buildPayload() {
    const discountValueNum = Number(form.discountValue);
    if (!form.code.trim()) return null;
    if (!Number.isFinite(discountValueNum) || discountValueNum <= 0) return null;
    return {
      code: form.code,
      description: form.description || undefined,
      discountType: form.discountType,
      discountValue: discountValueNum,
      maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
      totalUsageLimit: form.totalUsageLimit ? Number(form.totalUsageLimit) : null,
      perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
      startsAt: form.startsAt || null,
      expiresAt: form.expiresAt || null,
      isEnabled: form.isEnabled,
      categoryIds: form.categoryIds,
      productIds: form.productIds,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    if (!payload) return toast.error("Enter a code and a valid discount value");

    setSaving(true);
    try {
      if (editing) {
        const updated = await api.patch<CouponRow>(`/api/admin/coupons/${editing.id}`, payload);
        setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success("Coupon updated");
      } else {
        const created = await api.post<CouponRow>("/api/admin/coupons", payload);
        setCoupons((prev) => [created, ...prev]);
        toast.success("Coupon created");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/coupons/${deleteTarget.id}`);
      setCoupons((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success("Coupon deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleToggleEnabled(coupon: CouponRow) {
    try {
      const updated = await api.patch<CouponRow>(`/api/admin/coupons/${coupon.id}`, {
        code: coupon.code,
        description: coupon.description ?? undefined,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        minOrderAmount: coupon.minOrderAmount,
        totalUsageLimit: coupon.totalUsageLimit,
        perCustomerLimit: coupon.perCustomerLimit,
        startsAt: coupon.startsAt,
        expiresAt: coupon.expiresAt,
        isEnabled: !coupon.isEnabled,
        categoryIds: coupon.categories.map((c) => c.categoryId),
        productIds: coupon.products.map((p) => p.productId),
      });
      setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update");
    }
  }

  function toggleCategory(id: string) {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((c) => c !== id) : [...f.categoryIds, id],
    }));
  }

  function toggleProduct(id: string) {
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id) ? f.productIds.filter((p) => p !== id) : [...f.productIds, id],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
          <p className="text-muted-foreground">Discount codes customers can apply at checkout.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add coupon
        </Button>
      </div>

      {coupons.length > 0 && (
        <Tabs value={filter} onValueChange={(v) => setFilter((v as FilterTab) ?? "ALL")}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="ACTIVE">Active</TabsTrigger>
            <TabsTrigger value="EXPIRED">Expired</TabsTrigger>
            <TabsTrigger value="DISABLED">Disabled</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {coupons.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No coupons yet"
          description="Create a discount code your customers can apply at checkout."
          action={<Button onClick={openCreate}>Add coupon</Button>}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">No coupons in this filter.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {filtered.map((coupon) => {
            const status = couponStatus(coupon);
            return (
              <div key={coupon.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono font-semibold text-sm">{coupon.code}</p>
                    <Badge variant="secondary" className="text-xs">
                      {coupon.discountType === "PERCENTAGE"
                        ? `${coupon.discountValue}% off`
                        : `${formatCurrency(coupon.discountValue, currency)} off`}
                    </Badge>
                    {status === "EXPIRED" && <Badge variant="outline" className="text-xs">Expired</Badge>}
                    {status === "SCHEDULED" && <Badge variant="outline" className="text-xs">Scheduled</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {coupon.minOrderAmount != null ? `Min order ${formatCurrency(coupon.minOrderAmount, currency)} · ` : ""}
                    {coupon.usageCount} used
                    {coupon.totalUsageLimit != null ? ` / ${coupon.totalUsageLimit}` : ""}
                    {coupon.perCustomerLimit != null ? ` · ${coupon.perCustomerLimit} per customer` : ""}
                  </p>
                </div>
                <Switch checked={coupon.isEnabled} onCheckedChange={() => handleToggleEnabled(coupon)} aria-label="Enable/disable coupon" />
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(coupon)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(coupon)} aria-label="Delete" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit coupon" : "Add coupon"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Code" htmlFor="coupon-code" required>
                <Input
                  id="coupon-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. WELCOME50"
                  autoFocus
                />
              </FormRow>
              <FormRow label="Description" htmlFor="coupon-description">
                <Input
                  id="coupon-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Shown to you only"
                />
              </FormRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Discount type" htmlFor="coupon-type">
                <Select
                  value={form.discountType}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, discountType: v as typeof f.discountType }))}
                >
                  <SelectTrigger id="coupon-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    <SelectItem value="FIXED">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Discount value" htmlFor="coupon-value" required>
                <Input
                  id="coupon-value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                />
              </FormRow>
            </div>

            {form.discountType === "PERCENTAGE" && (
              <FormRow label="Maximum discount amount" htmlFor="coupon-max" description="Caps the percentage discount — leave blank for no cap">
                <Input
                  id="coupon-max"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.maxDiscountAmount}
                  onChange={(e) => setForm((f) => ({ ...f, maxDiscountAmount: e.target.value }))}
                />
              </FormRow>
            )}

            <FormRow label="Minimum order amount" htmlFor="coupon-min-order" description="Leave blank for no minimum">
              <Input
                id="coupon-min-order"
                type="number"
                min={0}
                step="0.01"
                value={form.minOrderAmount}
                onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
              />
            </FormRow>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Total usage limit" htmlFor="coupon-total-limit" description="Across all customers">
                <Input
                  id="coupon-total-limit"
                  type="number"
                  min={1}
                  value={form.totalUsageLimit}
                  onChange={(e) => setForm((f) => ({ ...f, totalUsageLimit: e.target.value }))}
                  placeholder="Unlimited"
                />
              </FormRow>
              <FormRow label="Per-customer limit" htmlFor="coupon-customer-limit" description="Requires login if set">
                <Input
                  id="coupon-customer-limit"
                  type="number"
                  min={1}
                  value={form.perCustomerLimit}
                  onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))}
                  placeholder="Unlimited"
                />
              </FormRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Starts on" htmlFor="coupon-starts">
                <Input
                  id="coupon-starts"
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Expires on" htmlFor="coupon-expires">
                <Input
                  id="coupon-expires"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </FormRow>
            </div>

            {categories.length > 0 && (
              <FormRow
                label="Restrict to categories"
                htmlFor="coupon-categories"
                description="Leave all unchecked to apply to the whole cart"
              >
                <div className="max-h-32 overflow-y-auto rounded-lg border p-2 space-y-1.5">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.categoryIds.includes(c.id)} onCheckedChange={() => toggleCategory(c.id)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </FormRow>
            )}

            {products.length > 0 && (
              <FormRow
                label="Restrict to products"
                htmlFor="coupon-products"
                description="Leave all unchecked to apply to the whole cart"
              >
                <div className="max-h-32 overflow-y-auto rounded-lg border p-2 space-y-1.5">
                  {products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.productIds.includes(p.id)} onCheckedChange={() => toggleProduct(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              </FormRow>
            )}

            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium select-none">Enabled</p>
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete coupon?"
        description={`"${deleteTarget?.code}" will no longer be usable at checkout.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
