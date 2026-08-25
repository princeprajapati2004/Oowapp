"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { PAYMENT_METHODS, deriveOrderType } from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";
import type { Product } from "@/lib/types/manual-order";

type OrderTypeOption = "Takeaway" | "Dine-in" | "Delivery";
const ORDER_TYPE_OPTIONS: OrderTypeOption[] = ["Takeaway", "Dine-in", "Delivery"];

interface EditLine {
  id?: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export function OrderInlineEditPanel({
  order,
  currency,
  onCancel,
  onSaved,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  onCancel: () => void;
  onSaved: (order: AdminOrderEventOrder) => void;
}) {
  const [customerName, setCustomerName] = useState(order.customerName || "");
  const [orderType, setOrderType] = useState<OrderTypeOption>(deriveOrderType(order));
  const [tableNumber, setTableNumber] = useState(order.tableNumber || "");
  const [deliveryAddress, setDeliveryAddress] = useState(order.deliveryAddress || "");
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod || "CASH");

  const [lines, setLines] = useState<EditLine[]>(
    order.items.map((item) => ({
      id: item.id,
      productId: item.productId ?? item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }))
  );
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Order type can't be changed once out for delivery (the non-delivery
  // status flow has no OUT_FOR_DELIVERY/DELIVERED steps to fall back into) —
  // mirrors the server-side guard in handleEditItems.
  const orderTypeLocked = order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERED";

  useEffect(() => {
    if (!showAddPanel || productsLoaded) return;
    api
      .get<Product[]>("/api/admin/products")
      .then((data) => setProducts(data.filter((p) => p.isAvailable && p.isVisible)))
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setProductsLoaded(true));
  }, [showAddPanel, productsLoaded]);

  const loadingProducts = showAddPanel && !productsLoaded;
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  function updateQty(productId: string, delta: number) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)));
  }

  function updatePrice(productId: string, price: number) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, price: Math.max(0, price) } : l)));
  }

  // Existing lines (with an id) are kept in state at quantity 0 rather than
  // spliced out entirely — handleSave needs to still send {id, quantity: 0}
  // for them so the server actually deletes the row. Newly-added lines (no
  // id yet, never persisted) are safe to splice, since there's nothing on
  // the server to tell about.
  function removeLine(productId: string) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.productId !== productId) return [l];
        return l.id ? [{ ...l, quantity: 0 }] : [];
      })
    );
  }

  function addProduct(product: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId: product.id, name: product.name, price: Number(product.price), quantity: 1 }];
    });
  }

  const visibleLines = lines.filter((l) => l.quantity > 0);
  const previewSubtotal = visibleLines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  async function handleSave() {
    if (visibleLines.length === 0) {
      toast.error("An order can't be saved with no items — cancel the order instead if it should be removed.");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Customer name can't be empty.");
      return;
    }
    if (orderType === "Dine-in" && !tableNumber.trim()) {
      toast.error("Table number is required for Dine-in orders.");
      return;
    }
    if (orderType === "Delivery" && !deliveryAddress.trim()) {
      toast.error("Delivery address is required for Delivery orders.");
      return;
    }

    const items = visibleLines.filter((l) => l.id).map((l) => ({ id: l.id!, quantity: l.quantity, price: l.price }));
    const newItems = visibleLines.filter((l) => !l.id).map((l) => ({ productId: l.productId, quantity: l.quantity, price: l.price }));
    // Removed lines (had an id, now filtered out of visibleLines entirely)
    // still need to be sent with quantity 0 so the server deletes them.
    const removedItems = lines.filter((l) => l.id && l.quantity === 0).map((l) => ({ id: l.id!, quantity: 0 }));

    setSaving(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "edit_items",
        items: [...items, ...removedItems],
        newItems,
        customerName: customerName.trim(),
        paymentMethod,
        orderType,
        tableNumber: orderType === "Dine-in" ? tableNumber.trim() : undefined,
        deliveryAddress: orderType === "Delivery" ? deliveryAddress.trim() : undefined,
      });
      onSaved(updated);
      toast.success("Order updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer Details</p>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Name</label>
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Order Type</label>
          <Select
            value={orderType}
            onValueChange={(v) => setOrderType((v as OrderTypeOption) ?? orderType)}
            disabled={orderTypeLocked}
          >
            <SelectTrigger className="w-full" disabled={orderTypeLocked}>
              <SelectValue>{orderType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDER_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {orderTypeLocked && (
            <p className="text-[11px] text-muted-foreground">Order type can&apos;t be changed once the order is out for delivery.</p>
          )}
        </div>
        {orderType === "Dine-in" && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Table Number</label>
            <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. 5" />
          </div>
        )}
        {orderType === "Delivery" && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Delivery Address</label>
            <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" />
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Method</p>
        <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? paymentMethod)}>
          <SelectTrigger className="w-full">
            <SelectValue>{PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label ?? paymentMethod}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items Ordered</p>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddPanel((v) => !v)}>
            {showAddPanel ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {showAddPanel ? "Done" : "Add Menu Item"}
          </Button>
        </div>

        {!showAddPanel ? (
          <div className="space-y-2">
            {visibleLines.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No items — add something above.</p>
            ) : (
              visibleLines.map((line) => (
                <div key={line.productId} className="space-y-2 rounded-xl border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{line.name}</p>
                    <button
                      type="button"
                      onClick={() => removeLine(line.productId)}
                      aria-label={`Remove ${line.name}`}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQty(line.productId, -1)}
                        aria-label={`Decrease quantity of ${line.name}`}
                        className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                      >
                        <Minus className="size-3.5" />
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
                    <div className="flex flex-1 items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Price ₹</span>
                      <Input
                        type="number"
                        min={0}
                        value={line.price}
                        onChange={(e) => updatePrice(line.productId, Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(line.price * line.quantity, currency)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
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
            <div className="max-h-72 space-y-2 overflow-y-auto">
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
                          className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20 active:scale-95"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Subtotal (before tax/discount)</span>
          <span className="font-semibold">{formatCurrency(previewSubtotal, currency)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Tax, discount, and the final total are recalculated when you save.</p>
      </section>

      <div className="sticky bottom-0 -mx-3 flex items-center gap-2.5 border-t bg-background px-3 pt-3 pb-3 sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
