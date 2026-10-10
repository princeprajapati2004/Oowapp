"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { calculateBill, type BillTax } from "@/lib/services/billing";
import type { Category } from "@/generated/prisma/client";
import type { listTaxes } from "@/lib/services/tax";
import type { serializeTaxes } from "@/lib/serialize";

type TaxRow = ReturnType<typeof serializeTaxes<Awaited<ReturnType<typeof listTaxes>>[number]>>[number];

export function TaxesManager({
  initialTaxes,
  categories,
  currency,
}: {
  initialTaxes: TaxRow[];
  categories: Category[];
  currency: string;
}) {
  const router = useRouter();
  const [taxes, setTaxes] = useState(initialTaxes);
  const [deleteTarget, setDeleteTarget] = useState<TaxRow | null>(null);
  const [previewCategoryId, setPreviewCategoryId] = useState<string>(categories[0]?.id ?? "");

  const preview = useMemo(() => {
    const sampleItems = previewCategoryId
      ? [{ id: "sample", name: "Sample item", price: 500, quantity: 1, categoryId: previewCategoryId }]
      : [];
    const billTaxes: BillTax[] = taxes.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      value: t.value,
      appliesTo: t.appliesTo,
      categoryId: t.categoryId,
      isEnabled: t.isEnabled,
    }));
    return calculateBill(sampleItems, billTaxes);
  }, [taxes, previewCategoryId]);

  function openCreate() {
    router.push("/admin/taxes/new");
  }

  function openEdit(tax: TaxRow) {
    router.push(`/admin/taxes/${tax.id}/edit`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/taxes/${deleteTarget.id}`);
      setTaxes((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success("Tax deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleToggleEnabled(tax: TaxRow) {
    try {
      const updated = await api.patch<Awaited<ReturnType<typeof listTaxes>>[number]>(
        `/api/admin/taxes/${tax.id}`,
        {
          name: tax.name,
          type: tax.type,
          value: tax.value,
          appliesTo: tax.appliesTo,
          categoryId: tax.categoryId,
          isEnabled: !tax.isEnabled,
        }
      );
      const serialized = { ...updated, value: Number(updated.value) } as TaxRow;
      setTaxes((prev) => prev.map((t) => (t.id === serialized.id ? serialized : t)));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taxes &amp; charges</h1>
          <p className="text-muted-foreground">GST, service charge, packaging, delivery — anything you add to the bill.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add tax
        </Button>
      </div>

      {taxes.length === 0 ? (
        <EmptyState
          icon={Percent}
          title="No taxes yet"
          description="Add GST, service charge, or any custom charge — it will calculate automatically on every bill."
          action={<Button onClick={openCreate}>Add tax</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 overflow-hidden rounded-xl border bg-card divide-y">
            {taxes.map((tax) => (
              <div key={tax.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{tax.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <Badge variant="secondary" className="text-xs">
                      {tax.type === "PERCENTAGE" ? `${tax.value}%` : formatCurrency(tax.value, currency)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {tax.appliesTo === "ENTIRE_BILL"
                        ? "Entire bill"
                        : `Category: ${tax.category?.name ?? "—"}`}
                    </span>
                  </div>
                </div>
                <Switch checked={tax.isEnabled} onCheckedChange={() => handleToggleEnabled(tax)} aria-label="Enable/disable tax" />
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(tax)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(tax)} aria-label="Delete" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sample bill preview</CardTitle>
              <CardDescription>
                See how a {formatCurrency(500, currency)} item is taxed right now.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.length > 1 && (
                <Select value={previewCategoryId} onValueChange={(v) => setPreviewCategoryId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {categories.find((c) => c.id === previewCategoryId)?.name ?? "Select category"}
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
              )}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(preview.subtotal, currency)}</span>
                </div>
                {preview.taxLines.map((line) => (
                  <div key={line.id} className="flex justify-between text-muted-foreground">
                    <span>{line.name}</span>
                    <span>{formatCurrency(line.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <span>Grand total</span>
                  <span>{formatCurrency(preview.grandTotal, currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete tax?"
        description={`"${deleteTarget?.name}" will no longer apply to bills.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
