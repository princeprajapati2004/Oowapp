"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";
import type { Product } from "@/lib/types/manual-order";

// One unified editable row per line — existing OrderItems carry `id` (sent
// back as a quantity update/removal), newly-added products don't (sent as
// `newItems`, resolved server-side from the real Product row — this modal
// never sends a price to the API, only productId/quantity).
interface EditLine {
  id?: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export function OrderEditModal({
  order,
  currency,
  open,
  onOpenChange,
  onSaved,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (order: AdminOrderEventOrder) => void;
}) {
  const [lines, setLines] = useState<EditLine[]>([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset to the order's current items exactly when the dialog opens —
  // "adjusting state when a prop changes" during render, same pattern
  // OrderPaymentModal already uses, so re-opening never shows stale edits
  // from a previous view.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLines(
        order.items.map((item) => ({
          id: item.id,
          productId: item.productId ?? item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        }))
      );
      setShowAddPanel(false);
      setSearch("");
    }
  }

  useEffect(() => {
    if (!showAddPanel || productsLoaded) return;
    api
      .get<Product[]>("/api/admin/products")
      .then((data) => setProducts(data.filter((p) => p.isAvailable && p.isVisible)))
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setProductsLoaded(true));
  }, [showAddPanel, productsLoaded]);

  const loadingProducts = showAddPanel && !productsLoaded;

  function addProduct(product: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId: product.id, name: product.name, price: Number(product.price), quantity: 1 }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)));
  }

  const visibleLines = lines.filter((l) => l.quantity > 0);
  const previewSubtotal = visibleLines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function handleSave() {
    if (visibleLines.length === 0) {
      toast.error("An order can't be saved with no items — cancel the order instead if it should be removed.");
      return;
    }
    const items = lines.filter((l) => l.id).map((l) => ({ id: l.id!, quantity: l.quantity }));
    const newItems = lines.filter((l) => !l.id && l.quantity > 0).map((l) => ({ productId: l.productId, quantity: l.quantity }));
    if (items.length === 0 && newItems.length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "edit_items",
        items,
        newItems,
      });
      onSaved(updated);
      const wasPaid = order.paymentStatus === "PAID";
      if (wasPaid && updated.paymentStatus === "PARTIALLY_PAID") {
        const due = (updated.discountedTotal ?? updated.grandTotal) - (updated.paidAmount ?? 0);
        toast(`Order updated — ${formatCurrency(due, currency)} is now outstanding since the total changed.`);
      } else {
        toast.success("Order updated");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modify Order</DialogTitle>
          <DialogDescription>{order.billNumber} · {order.customerName || "Walk-in Customer"}</DialogDescription>
        </DialogHeader>

        {!showAddPanel ? (
          <>
            <div className="space-y-2">
              {visibleLines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No items — add something below.</p>
              ) : (
                visibleLines.map((line) => (
                  <div key={line.productId} className="flex items-center gap-3 rounded-xl border p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(line.price, currency)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQty(line.productId, -1)}
                        aria-label={`Decrease quantity of ${line.name}`}
                        className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                      >
                        {line.quantity === 1 ? <Trash2 className="size-3.5 text-destructive" /> : <Minus className="size-3.5" />}
                      </button>
                      <span className="w-5 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(line.productId, 1)}
                        aria-label={`Increase quantity of ${line.name}`}
                        className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(line.price * line.quantity, currency)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => setShowAddPanel(true)}>
              <Plus className="size-4" /> Add Items
            </Button>

            <div className="flex justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Subtotal (before tax/discount)</span>
              <span className="font-semibold">{formatCurrency(previewSubtotal, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Tax, discount, and the final total are recalculated when you save.</p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Discard
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {loadingProducts ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading products…</p>
              ) : filteredProducts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No products match &quot;{search}&quot;</p>
              ) : (
                filteredProducts.map((product) => {
                  const line = lines.find((l) => l.productId === product.id);
                  return (
                    <div key={product.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(Number(product.price), currency)}</p>
                      </div>
                      {line && line.quantity > 0 ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateQty(product.id, -1)}
                            aria-label={`Decrease quantity of ${product.name}`}
                            className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(product.id, 1)}
                            aria-label={`Increase quantity of ${product.name}`}
                            className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addProduct(product)}
                          className={cn("shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20 active:scale-95")}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddPanel(false)} className="w-full gap-1.5">
                <X className="size-4" /> Done adding
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
