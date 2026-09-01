"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EvidencePhotosInput } from "@/components/shared/evidence-photos-input";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import {
  LOSS_DAMAGE_TYPES,
  LOSS_DAMAGE_TYPE_LABELS,
  DAMAGE_TYPES,
  DAMAGE_TYPE_LABELS,
  type LossDamageType,
  type DamageType,
} from "@/lib/loss-damage-status";
import type { LossDamagePayload } from "@/lib/services/loss-damage";

type PickerProduct = { id: string; name: string; imageUrl: string | null; price: number; costPrice: number | null; stock: number | null };

export function AddLossDamageDialog({
  open,
  onOpenChange,
  currency,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  onCreated: (record: LossDamagePayload) => void;
}) {
  const [products, setProducts] = useState<PickerProduct[] | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<PickerProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [type, setType] = useState<LossDamageType>("DAMAGED");
  const [damageType, setDamageType] = useState<DamageType>("BROKEN");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [overrideValue, setOverrideValue] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualValueReason, setManualValueReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const clientRequestId = useRef<string>("");

  useEffect(() => {
    if (open && !clientRequestId.current) {
      clientRequestId.current = crypto.randomUUID();
    }
    if (open && products === null) {
      api.get<PickerProduct[]>("/api/admin/loss-damage/products").then(setProducts).catch(() => setProducts([]));
    }
  }, [open, products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [products, productQuery]);

  function reset() {
    setSelectedProduct(null);
    setProductQuery("");
    setQuantity(1);
    setType("DAMAGED");
    setDamageType("BROKEN");
    setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
    setEvidenceUrls([]);
    setOverrideValue(false);
    setManualValue("");
    setManualValueReason("");
    clientRequestId.current = "";
  }

  const estimatedLoss = selectedProduct?.costPrice != null ? Math.round(selectedProduct.costPrice * quantity * 100) / 100 : null;
  const parsedManualValue = manualValue.trim() ? Number(manualValue) : null;
  const manualValueInvalid = overrideValue && (parsedManualValue == null || Number.isNaN(parsedManualValue) || parsedManualValue < 0);
  const manualReasonInvalid = overrideValue && !manualValueReason.trim();
  const quantityExceedsStock = selectedProduct?.stock != null && quantity > selectedProduct.stock;

  async function handleSubmit() {
    if (!selectedProduct) {
      toast.error("Select a product");
      return;
    }
    if (manualValueInvalid) {
      toast.error("Enter a valid override amount");
      return;
    }
    if (manualReasonInvalid) {
      toast.error("A reason is required for a manual value override");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.post<LossDamagePayload>("/api/admin/loss-damage", {
        productId: selectedProduct.id,
        quantity,
        type,
        damageType: type === "DAMAGED" ? damageType : undefined,
        notes: notes.trim() || undefined,
        date: new Date(date).toISOString(),
        evidencePhotoUrls: evidenceUrls,
        clientRequestId: clientRequestId.current,
        manualValue: overrideValue ? parsedManualValue ?? undefined : undefined,
        manualValueReason: overrideValue ? manualValueReason.trim() : undefined,
      });
      onCreated(created);
      toast.success("Loss / damage recorded");
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't record loss/damage");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Loss / Damage</DialogTitle>
          <DialogDescription>Record stock lost or damaged outside of a customer return.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Product *</Label>
            {selectedProduct ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedProduct.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedProduct.stock != null ? `${selectedProduct.stock} in stock` : "Stock not tracked"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>Change</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search products…"
                    className="h-10 pl-8"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                  {products === null ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">Loading…</p>
                  ) : filteredProducts.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">No products found</p>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProduct(p)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {p.stock != null ? `${p.stock} in stock` : "—"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedProduct && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity *</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                  <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setQuantity((q) => q + 1)}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                {quantityExceedsStock && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Only {selectedProduct?.stock} in stock — stock will be clamped to 0, not negative.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Type *</Label>
                <Select value={type} onValueChange={(v) => setType(v as LossDamageType)}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue>{LOSS_DAMAGE_TYPE_LABELS[type]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LOSS_DAMAGE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{LOSS_DAMAGE_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {type === "DAMAGED" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Damage Type</Label>
                  <Select value={damageType} onValueChange={(v) => setDamageType(v as DamageType)}>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue>{DAMAGE_TYPE_LABELS[damageType]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DAMAGE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{DAMAGE_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Evidence Photos (optional)</Label>
                <EvidencePhotosInput urls={evidenceUrls} onChange={setEvidenceUrls} endpoint="/api/admin/loss-damage/upload" />
              </div>

              {estimatedLoss != null ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
                  <span className="text-sm font-medium">System Value ({quantity} × {formatCurrency(selectedProduct!.costPrice!, currency)})</span>
                  <span className="text-sm font-semibold">{formatCurrency(estimatedLoss, currency)}</span>
                </div>
              ) : (
                <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  This product has no purchase/cost price set, so a system value can&apos;t be calculated. Enter a manual value below if you want one recorded.
                </p>
              )}

              <div className="space-y-2 rounded-lg border px-3 py-2.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={overrideValue} onCheckedChange={(v) => setOverrideValue(v === true)} />
                  Override value manually
                </label>
                {overrideValue && (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Adjusted Value *</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={manualValue}
                        onChange={(e) => setManualValue(e.target.value)}
                        placeholder="0.00"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reason *</Label>
                      <Input
                        value={manualValueReason}
                        onChange={(e) => setManualValueReason(e.target.value)}
                        placeholder="e.g. Manual valuation"
                        className="h-10"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedProduct || manualValueInvalid || manualReasonInvalid}>
            {submitting ? "Saving…" : "Save Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
