"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Minus, Search, X, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api, ApiError } from "@/lib/api-client";
import { calculateBill } from "@/lib/services/billing";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

type PaymentMethod = "CASH" | "UPI" | "CARD" | "ONLINE" | "PENDING";

interface Product {
  id: string;
  name: string;
  price: number;
  category: { id: string; name: string };
  isAvailable: boolean;
  isVisible: boolean;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  categoryId: string;
}

interface Props {
  currency: string;
  shopSlug: string;
  onCreated?: () => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
  { value: "PENDING", label: "Pending" },
];

export function CreateOrderDialog({ currency, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED" | "">("");
  const [discountValue, setDiscountValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingProducts(true);
    api
      .get<Product[]>("/api/admin/products")
      .then((data) => setProducts(data.filter((p) => p.isAvailable && p.isVisible)))
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setLoadingProducts(false));
  }, [open]);

  function resetForm() {
    setSearch("");
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setTableNumber("");
    setNotes("");
    setPaymentMethod("CASH");
    setDiscountType("");
    setDiscountValue("");
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: product.id, name: product.name, price: Number(product.price), quantity: 1, categoryId: product.category.id }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) => {
      const next = prev.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
      );
      return next.filter((i) => i.quantity > 0);
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  const billItems = cart.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId }));
  const bill = calculateBill(billItems, []); // taxes handled server-side on creation
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const discountAmount = useMemo(() => {
    const v = parseFloat(discountValue);
    if (!discountType || isNaN(v) || v <= 0) return 0;
    return discountType === "PERCENTAGE" ? (subtotal * v) / 100 : v;
  }, [discountType, discountValue, subtotal]);

  const estimatedTotal = Math.max(0, subtotal - discountAmount);

  async function handleSubmit() {
    if (cart.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        items: cart,
        paymentMethod,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (discountType && discountValue && parseFloat(discountValue) > 0) {
        body.discountType = discountType;
        body.discountValue = parseFloat(discountValue);
      }

      const res = await api.post<{ billNumber: string; orderId: string }>("/api/admin/orders", body);
      toast.success(`Order ${res.billNumber} created`);
      handleClose();
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Create Order
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-base font-semibold">Create Manual Order</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col md:flex-row gap-0 divide-y md:divide-y-0 md:divide-x">
              {/* Product Selection */}
              <div className="md:w-[55%] p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>

                {loadingProducts ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading products...</p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No products found</p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {filtered.map((product) => {
                      const inCart = cart.find((i) => i.productId === product.id);
                      return (
                        <div
                          key={product.id}
                          className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 hover:bg-muted transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatCurrency(Number(product.price), currency)}
                              <span className="mx-1">·</span>
                              {product.category.name}
                            </div>
                          </div>
                          {inCart ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => updateQty(product.id, -1)}
                                className="flex size-6 items-center justify-center rounded border hover:bg-muted"
                              >
                                <Minus className="size-3" />
                              </button>
                              <span className="w-6 text-center text-sm font-medium tabular-nums">{inCart.quantity}</span>
                              <button
                                onClick={() => updateQty(product.id, 1)}
                                className="flex size-6 items-center justify-center rounded border hover:bg-muted"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(product)}
                              className="shrink-0 rounded border px-2 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cart + Details */}
              <div className="md:w-[45%] p-4 space-y-4">
                {/* Cart Summary */}
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <ShoppingCart className="size-8 mb-2 opacity-40" />
                    <p className="text-sm">No items added</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {cart.map((item) => (
                      <div key={item.productId} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate">{item.name}</span>
                        <span className="text-muted-foreground tabular-nums">×{item.quantity}</span>
                        <span className="font-medium tabular-nums w-16 text-right">
                          {formatCurrency(item.price * item.quantity, currency)}
                        </span>
                        <button onClick={() => removeFromCart(item.productId)} className="text-muted-foreground hover:text-destructive">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm font-medium">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal, currency)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600">
                        <span>Discount</span>
                        <span>−{formatCurrency(discountAmount, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold">
                      <span>Est. Total</span>
                      <span>{formatCurrency(estimatedTotal, currency)}</span>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Customer + Order Details */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Customer Name</Label>
                      <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Table / Notes</Label>
                    <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Table no. or takeaway" className="h-8 text-sm" />
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setPaymentMethod(m.value)}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                            paymentMethod === m.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-muted text-muted-foreground"
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Discount */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Discount (optional)</Label>
                    <div className="flex gap-2">
                      <div className="flex rounded-md border overflow-hidden text-xs">
                        {(["", "PERCENTAGE", "FIXED"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setDiscountType(t)}
                            className={cn(
                              "px-2.5 py-1.5 font-medium transition-colors",
                              discountType === t ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                            )}
                          >
                            {t === "" ? "None" : t === "PERCENTAGE" ? "%" : "₹"}
                          </button>
                        ))}
                      </div>
                      {discountType && (
                        <Input
                          type="number"
                          min="0"
                          placeholder={discountType === "PERCENTAGE" ? "10" : "50"}
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          className="h-8 text-sm flex-1"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Order Notes</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." className="h-8 text-sm" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3 shrink-0">
            <div className="text-sm">
              {cart.length > 0 ? (
                <>
                  <span className="font-medium">{cart.reduce((s, i) => s + i.quantity, 0)} items</span>
                  <span className="text-muted-foreground"> · {formatCurrency(estimatedTotal, currency)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">No items</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || cart.length === 0}>
                {submitting ? "Creating..." : "Create Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
