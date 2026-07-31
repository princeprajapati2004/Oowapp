"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Plus,
  Minus,
  X,
  ExternalLink,
  ChevronDown,
  Trash2,
  ImageOff,
  PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { AddItemsPanel } from "@/components/admin/add-items-panel";
import { api, ApiError } from "@/lib/api-client";
import { calculateBill } from "@/lib/services/billing";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { readLocalStore, writeLocalStore, clearLocalStore } from "@/lib/utils/local-store";
import {
  type Product,
  type CartItem,
  type Tax,
  type PastCustomer,
  type PaymentMethod,
  PAYMENT_METHODS,
} from "@/lib/types/manual-order";

type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";

const QUICK_NOTES = ["No onions", "Extra spicy", "Less oil", "No dairy", "Contactless"];
const MAX_RECENT_SEARCHES = 5;
const MAX_RECENTLY_VIEWED = 8;
const DUPLICATE_HANDOFF_KEY = "oowapp:duplicateOrder";

// Pre-fill payload for the "Duplicate Order" action on the orders list.
// Items are resolved against the currently-loaded product catalog (below) so
// a duplicated order always reflects live prices/categories, and items whose
// product was since deleted are skipped rather than fabricated. Handed off
// via sessionStorage (see orders-manager.tsx) since this is now a real page
// navigation, not a prop passed within one component tree.
export interface DuplicateOrderData {
  items: { productId: string; quantity: number }[];
  customerName?: string;
  customerPhone?: string;
  tableNumber?: string;
  notes?: string;
}

interface DraftOrder {
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  tableNumber: string;
  deliveryAddress: string;
  notes: string;
  referenceNumber: string;
  couponCode: string;
  deliveryInstructions: string;
  internalStaffNotes: string;
  paymentMethod: PaymentMethod;
  discountType: "PERCENTAGE" | "FIXED" | "";
  discountValue: string;
  savedAt: string;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function CreateOrderPage({
  currency,
  shopSlug,
  initialOrderType,
}: {
  currency: string;
  shopSlug: string;
  initialOrderType?: OrderType;
}) {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [customers, setCustomers] = useState<PastCustomer[]>([]);
  const [popularProductIds, setPopularProductIds] = useState<string[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  // Set inside the products fetch's .then() below (never read Date.now()
  // during render — React's purity rules disallow it) — passed down so the
  // "New" product badge has a stable reference point.
  const [catalogLoadedAt, setCatalogLoadedAt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [addItemsOpen, setAddItemsOpen] = useState(false);

  // Form state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType ?? "DINE_IN");
  const [tableNumber, setTableNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [notes, setNotes] = useState("");
  // Local-device-only scratchpad — never sent to the API or shown on the bill.
  const [internalStaffNotes, setInternalStaffNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [splitAmounts, setSplitAmounts] = useState([
    { method: "Cash", amount: "" },
    { method: "UPI", amount: "" },
  ]);

  // Recents — persisted per shop in the browser only. Deliberately not
  // synced to the server: personal quick-access shortcuts for whoever is
  // using this device, not shared business data.
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() =>
    readLocalStore(shopSlug, "recentlyViewed", [] as string[])
  );
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readLocalStore(shopSlug, "recentSearches", [] as string[])
  );
  const [customerNotesMap, setCustomerNotesMap] = useState<Record<string, string>>(() =>
    readLocalStore(shopSlug, "customerNotes", {} as Record<string, string>)
  );
  const [showCustomerNotes, setShowCustomerNotes] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [draftBanner, setDraftBanner] = useState<DraftOrder | null>(null);

  const pendingDuplicateRef = useRef<DuplicateOrderData | null>(null);
  const hasCheckedDuplicateRef = useRef(false);

  // One-shot: consume any duplicate-order hand-off left by the orders list
  // right before it navigated here (see orders-manager.tsx). Read-and-clear
  // immediately so a later fresh "Create Order" visit is never affected.
  useEffect(() => {
    if (hasCheckedDuplicateRef.current) return;
    hasCheckedDuplicateRef.current = true;
    try {
      const raw = sessionStorage.getItem(DUPLICATE_HANDOFF_KEY);
      if (raw) {
        sessionStorage.removeItem(DUPLICATE_HANDOFF_KEY);
        pendingDuplicateRef.current = JSON.parse(raw) as DuplicateOrderData;
      }
    } catch {
      // ignore malformed hand-off
    }
  }, []);

  useEffect(() => {
    api
      .get<Product[]>("/api/admin/products")
      .then((data) => {
        setProducts(data.filter((p) => p.isAvailable && p.isVisible));
        setCatalogLoadedAt(Date.now());
      })
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setLoadingProducts(false));
    api
      .get<Tax[]>("/api/admin/taxes")
      // Decimal fields serialize as strings over JSON — convert before use.
      .then((data) => setTaxes(data.filter((t) => t.isEnabled).map((t) => ({ ...t, value: Number(t.value) }))))
      .catch(() => {});
    api
      .get<PastCustomer[]>("/api/admin/customers")
      .then(setCustomers)
      .catch(() => {});
    api
      .get<{ productId: string; orderCount: number }[]>("/api/admin/products/stats")
      .then((rows) => setPopularProductIds(rows.map((r) => r.productId)))
      .catch(() => {});
  }, []);

  // Offer to resume a saved draft on first load, unless a duplicate-order
  // request takes priority.
  useEffect(() => {
    if (pendingDuplicateRef.current) return;
    const draft = readLocalStore<DraftOrder | null>(shopSlug, "draftOrder", null);
    if (draft && draft.cart.length > 0) {
      Promise.resolve().then(() => setDraftBanner(draft));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve a pending duplicate-order request once the product catalog has
  // loaded — items whose product was deleted since are skipped, never faked.
  useEffect(() => {
    if (!pendingDuplicateRef.current || loadingProducts || products.length === 0) return;
    const data = pendingDuplicateRef.current;
    pendingDuplicateRef.current = null;

    const resolved: CartItem[] = [];
    let skipped = 0;
    data.items.forEach((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        skipped++;
        return;
      }
      resolved.push({
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: item.quantity,
        categoryId: product.category.id,
        categoryName: product.category.name,
        imageUrl: product.imageUrl,
      });
    });

    setCart(resolved);
    if (data.customerName) setCustomerName(data.customerName);
    if (data.customerPhone) setCustomerPhone(data.customerPhone);
    if (data.tableNumber) setTableNumber(data.tableNumber);
    if (data.notes) setNotes(data.notes);

    if (resolved.length === 0) {
      toast.error("None of the original items are available anymore");
    } else if (skipped > 0) {
      toast(`Duplicated ${resolved.length} item(s) — ${skipped} no longer available`);
    } else {
      toast.success(`Duplicated ${resolved.length} item(s) from the original order`);
    }
  }, [products, loadingProducts]);

  const customerMatches = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    const pool = q
      ? customers.filter(
          (c) => (c.customerName ?? "").toLowerCase().includes(q) || (c.customerPhone ?? "").includes(q)
        )
      : customers.slice(0, 20);
    return pool.slice(0, 6);
  }, [customers, customerName]);

  const matchedCustomer = useMemo(() => {
    const phone = customerPhone.trim();
    if (!phone) return null;
    return customers.find((c) => c.customerPhone === phone) ?? null;
  }, [customers, customerPhone]);

  function buildDraft(): DraftOrder {
    return {
      cart,
      customerName,
      customerPhone,
      orderType,
      tableNumber,
      deliveryAddress,
      notes,
      referenceNumber,
      couponCode,
      deliveryInstructions,
      internalStaffNotes,
      paymentMethod,
      discountType,
      discountValue,
      savedAt: new Date().toISOString(),
    };
  }

  // Leaves the page — saves an in-progress cart as a draft (unless the leave
  // is a direct result of a successful submit) and navigates back to the
  // orders list, mirroring what closing the old dialog used to do.
  function handleLeave(opts?: { skipDraftSave?: boolean }) {
    if (opts?.skipDraftSave) {
      clearLocalStore(shopSlug, "draftOrder");
    } else if (cart.length > 0) {
      writeLocalStore(shopSlug, "draftOrder", buildDraft());
    } else {
      clearLocalStore(shopSlug, "draftOrder");
    }
    router.push("/admin/orders");
  }

  function resumeDraft() {
    if (!draftBanner) return;
    setCart(draftBanner.cart);
    setCustomerName(draftBanner.customerName);
    setCustomerPhone(draftBanner.customerPhone);
    setOrderType(draftBanner.orderType ?? "DINE_IN");
    setTableNumber(draftBanner.tableNumber);
    setDeliveryAddress(draftBanner.deliveryAddress ?? "");
    setNotes(draftBanner.notes);
    setReferenceNumber(draftBanner.referenceNumber ?? "");
    setCouponCode(draftBanner.couponCode ?? "");
    setDeliveryInstructions(draftBanner.deliveryInstructions ?? "");
    setInternalStaffNotes(draftBanner.internalStaffNotes ?? "");
    setPaymentMethod(draftBanner.paymentMethod);
    setDiscountType(draftBanner.discountType);
    setDiscountValue(draftBanner.discountValue);
    setDraftBanner(null);
    toast.success("Draft resumed");
  }

  function discardDraft() {
    clearLocalStore(shopSlug, "draftOrder");
    setDraftBanner(null);
  }

  function pushRecentlyViewed(productId: string) {
    setRecentlyViewedIds((prev) => {
      const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, MAX_RECENTLY_VIEWED);
      writeLocalStore(shopSlug, "recentlyViewed", next);
      return next;
    });
  }

  function commitSearch(query: string) {
    const q = query.trim();
    if (!q) return;
    setRecentSearches((prev) => {
      const next = [q, ...prev.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
      writeLocalStore(shopSlug, "recentSearches", next);
      return next;
    });
  }

  function saveCustomerNote(phone: string, note: string) {
    if (!phone) return;
    setCustomerNotesMap((prev) => {
      const next = { ...prev, [phone]: note };
      if (!note.trim()) delete next[phone];
      writeLocalStore(shopSlug, "customerNotes", next);
      return next;
    });
  }

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: 1,
          categoryId: product.category.id,
          categoryName: product.category.name,
          imageUrl: product.imageUrl,
        },
      ];
    });
    pushRecentlyViewed(product.id);
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) => {
      const next = prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i));
      return next.filter((i) => i.quantity > 0);
    });
  }

  function removeFromCart(productId: string) {
    const removed = cart.find((i) => i.productId === productId);
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    setPriceInputs((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    if (removed) {
      toast(`Removed ${removed.name}`, {
        action: { label: "Undo", onClick: () => setCart((prev) => [...prev, removed]) },
      });
    }
  }

  function handleClearCart() {
    setCart([]);
    setPriceInputs({});
    setShowClearConfirm(false);
    toast("Cart cleared");
  }

  // Free typing while the string is still a plausible in-progress number
  // (no negative sign is ever accepted), committing to the cart — and so
  // recalculating the live totals — the moment it parses to a valid amount.
  function handlePriceInputChange(productId: string, raw: string) {
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    setPriceInputs((prev) => ({ ...prev, [productId]: raw }));
    const parsed = Number(raw);
    if (raw !== "" && !Number.isNaN(parsed) && parsed >= 0) {
      setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, price: parsed } : i)));
    }
  }

  function handlePriceInputBlur(productId: string) {
    const item = cart.find((i) => i.productId === productId);
    const finalPrice = item ? item.price : 0;
    setPriceInputs((prev) => ({ ...prev, [productId]: finalPrice.toFixed(2) }));
  }

  function addQuickNote(phrase: string) {
    setNotes((prev) => (prev.trim() ? `${prev.trim()}, ${phrase}` : phrase));
  }

  const billItems = cart.map((i) => ({ id: i.productId, name: i.name, price: i.price, quantity: i.quantity, categoryId: i.categoryId }));
  const bill = calculateBill(billItems, taxes);
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);

  // Matches the server's discount base (subtotal + tax) — see the discount
  // calculation in /api/admin/orders/route.ts — so this preview never
  // disagrees with what actually gets saved.
  const discountAmount = useMemo(() => {
    const v = parseFloat(discountValue);
    if (!discountType || isNaN(v) || v <= 0) return 0;
    return discountType === "PERCENTAGE" ? (bill.grandTotal * v) / 100 : v;
  }, [discountType, discountValue, bill.grandTotal]);

  const estimatedTotal = Math.max(0, bill.grandTotal - discountAmount);
  // Rough heuristic (not a kitchen-timed guarantee) so staff can set customer
  // expectations — base handling time plus a couple of minutes per item.
  const estimatedPrepMinutes = cart.length === 0 ? 0 : Math.min(45, 5 + totalQty * 2);

  async function handleSubmit() {
    if (cart.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    const extraNoteParts: string[] = [];
    if (referenceNumber.trim()) extraNoteParts.push(`Ref#: ${referenceNumber.trim()}`);
    if (couponCode.trim()) extraNoteParts.push(`Coupon: ${couponCode.trim()}`);
    if (orderType === "DELIVERY" && deliveryInstructions.trim()) {
      extraNoteParts.push(`Delivery instructions: ${deliveryInstructions.trim()}`);
    }
    let effectiveNotes = [notes.trim(), ...extraNoteParts].filter(Boolean).join(" · ");

    if (paymentMethod === "SPLIT") {
      const parsed = splitAmounts
        .filter((s) => s.amount.trim() !== "")
        .map((s) => ({ method: s.method, amount: parseFloat(s.amount) || 0 }));
      const sum = parsed.reduce((s, p) => s + p.amount, 0);
      if (parsed.length < 2 || Math.abs(sum - estimatedTotal) > 1) {
        toast.error(`Split amounts must add up to ${formatCurrency(estimatedTotal, currency)}`);
        return;
      }
      const breakdown = parsed.map((p) => `${p.method}: ${formatCurrency(p.amount, currency)}`).join(", ");
      effectiveNotes = effectiveNotes ? `${effectiveNotes} · Split payment — ${breakdown}` : `Split payment — ${breakdown}`;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        items: cart.map(({ productId, name, price, quantity, categoryId }) => ({ productId, name, price, quantity, categoryId })),
        paymentMethod,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        tableNumber: orderType === "DINE_IN" ? tableNumber.trim() || undefined : undefined,
        deliveryAddress: orderType === "DELIVERY" ? deliveryAddress.trim() || undefined : undefined,
        notes: effectiveNotes || undefined,
      };
      if (discountType && discountValue && parseFloat(discountValue) > 0) {
        body.discountType = discountType;
        body.discountValue = parseFloat(discountValue);
      }

      const res = await api.post<{ billNumber: string; orderId: string; tokenNumber: number | null }>("/api/admin/orders", body);
      toast.success(
        `Order ${res.billNumber} created — ${totalQty} item(s)${res.tokenNumber ? ` · Token #${res.tokenNumber}` : ""}`
      );
      clearLocalStore(shopSlug, "draftOrder");
      // Straight to the invoice preview (the bill-detail page) instead of
      // back to the list — that page already renders the full invoice and
      // now carries Print/Share/Complete actions for this exact moment.
      router.push(`/admin/orders/${res.orderId}?created=1`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b bg-background/98 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => handleLeave()}
          aria-label="Back to orders"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-semibold">Create Manual Order</h1>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4">
        {draftBanner && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              Saved draft — {draftBanner.cart.reduce((s, i) => s + i.quantity, 0)} item(s), last edited{" "}
              {new Date(draftBanner.savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={discardDraft} className="rounded px-2 py-0.5 font-medium text-muted-foreground hover:bg-muted">
                Discard
              </button>
              <button onClick={resumeDraft} className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/90">
                Resume
              </button>
            </div>
          </div>
        )}

        {/* Order items */}
        {cart.length === 0 ? (
          <button
            onClick={() => setAddItemsOpen(true)}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <PackagePlus className="size-6 text-primary" />
            </div>
            <p className="font-semibold">Add Items</p>
            <p className="text-xs text-muted-foreground">Search or browse your menu</p>
          </button>
        ) : (
          <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold">Order Items ({totalQty})</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAddItemsOpen(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + Add more
                </button>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" /> Clear
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {cart.map((item) => (
                <div key={item.productId} className="flex items-center gap-3 rounded-xl border p-2.5">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.name} fill sizes="48px" className="object-cover" unoptimized />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <ImageOff className="size-4 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.categoryName}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        aria-label={`Remove ${item.name} from cart`}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Edit price for ${item.name}`}
                          value={priceInputs[item.productId] ?? item.price.toFixed(2)}
                          onChange={(e) => handlePriceInputChange(item.productId, e.target.value)}
                          onBlur={() => handlePriceInputBlur(item.productId)}
                          className="h-7 w-16 rounded-md border border-dashed bg-muted/40 px-1.5 text-xs font-semibold focus-visible:border-solid focus-visible:border-ring focus-visible:bg-background focus-visible:outline-none"
                        />
                        <span className="text-xs text-muted-foreground">each</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQty(item.productId, -1)}
                          aria-label={`Decrease quantity of ${item.name}`}
                          className="flex size-6 items-center justify-center rounded border transition-colors hover:bg-muted active:scale-95"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-medium tabular-nums">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.productId, 1)}
                          aria-label={`Increase quantity of ${item.name}`}
                          className="flex size-6 items-center justify-center rounded border transition-colors hover:bg-muted active:scale-95"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">
                        {formatCurrency(item.price * item.quantity, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-1 px-1">
              <div className="flex justify-between text-sm font-medium">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              {bill.taxLines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm text-muted-foreground">
                  <span>{line.name}</span>
                  <span>{formatCurrency(line.amount, currency)}</span>
                </div>
              ))}
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount</span>
                  <span>−{formatCurrency(discountAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Grand Total</span>
                <span>{formatCurrency(estimatedTotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[11px] text-muted-foreground">Est. prep ~{estimatedPrepMinutes} min</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    paymentMethod === "PENDING" ? "border-amber-300 text-amber-600" : "border-emerald-300 text-emerald-600"
                  )}
                >
                  {paymentMethod === "PENDING"
                    ? "Payment pending"
                    : `Pay via ${PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label}`}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Additional Details — collapsed by default */}
        <div className="rounded-2xl border bg-card px-4 shadow-sm">
          <Accordion>
            <AccordionItem value="details" className="border-b-0">
              <AccordionTrigger>Additional Details</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {/* Customer */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative space-y-1">
                      <Label className="text-xs">Customer Name</Label>
                      <div className="flex items-center gap-1.5">
                        {customerName.trim() && (
                          <span
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                              avatarColor(customerName)
                            )}
                            aria-hidden
                          >
                            {initialsOf(customerName)}
                          </span>
                        )}
                        <Input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          onFocus={() => setShowCustomerSuggestions(true)}
                          onBlur={() => setShowCustomerSuggestions(false)}
                          placeholder="Walk-in or search…"
                          className="h-8 text-sm"
                          autoComplete="off"
                        />
                      </div>
                      {showCustomerSuggestions && customerMatches.length > 0 && (
                        <div className="absolute top-full left-0 z-10 mt-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-md">
                          {customerMatches.map((c, i) => {
                            const phone = c.customerPhone ?? "";
                            return (
                              <button
                                type="button"
                                key={`${phone}-${i}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setCustomerName(c.customerName || "");
                                  setCustomerPhone(phone);
                                  setShowCustomerSuggestions(false);
                                }}
                                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                              >
                                <span
                                  className={cn(
                                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
                                    avatarColor(c.customerName || "?")
                                  )}
                                >
                                  {initialsOf(c.customerName || "?")}
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col items-start">
                                  <span className="truncate font-medium">{c.customerName || "Unnamed"}</span>
                                  {phone && <span className="text-muted-foreground">{phone}</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone Number</Label>
                      <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                    </div>
                  </div>

                  {matchedCustomer && (
                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowCustomerNotes((v) => !v)}
                        className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                      >
                        Notes <ChevronDown className={cn("size-3 transition-transform", showCustomerNotes && "rotate-180")} />
                      </button>
                      <a
                        href={`/admin/orders?q=${encodeURIComponent(customerPhone.trim())}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Order history <ExternalLink className="size-3" />
                      </a>
                    </div>
                  )}
                  {matchedCustomer && showCustomerNotes && (
                    <textarea
                      defaultValue={customerNotesMap[customerPhone.trim()] ?? ""}
                      onBlur={(e) => saveCustomerNote(customerPhone.trim(), e.target.value)}
                      placeholder="e.g. Regular customer, prefers less spicy…"
                      className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring"
                      rows={2}
                    />
                  )}

                  {/* Order Type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Order Type</Label>
                    <div className="flex overflow-hidden rounded-md border text-xs">
                      {([
                        { value: "DINE_IN", label: "Dine-in" },
                        { value: "TAKEAWAY", label: "Takeaway" },
                        { value: "DELIVERY", label: "Delivery" },
                      ] as const).map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setOrderType(t.value)}
                          className={cn(
                            "flex-1 px-2.5 py-1.5 font-medium transition-colors",
                            orderType === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {orderType === "DINE_IN" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Table Number</Label>
                      <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. Table 4" className="h-8 text-sm" />
                    </div>
                  )}
                  {orderType === "DELIVERY" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Delivery Address</Label>
                        <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street, area, landmark…" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Delivery Instructions</Label>
                        <Input value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} placeholder="e.g. Leave at the gate" className="h-8 text-sm" />
                      </div>
                    </>
                  )}

                  {/* Payment Method */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setPaymentMethod(m.value)}
                          aria-pressed={paymentMethod === m.value}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                            paymentMethod === m.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {paymentMethod === "SPLIT" && (
                      <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
                        {splitAmounts.map((row, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <select
                              value={row.method}
                              onChange={(e) => {
                                const next = [...splitAmounts];
                                next[idx] = { ...next[idx], method: e.target.value };
                                setSplitAmounts(next);
                              }}
                              className="h-7 rounded-md border bg-transparent px-1.5 text-xs"
                            >
                              {["Cash", "UPI", "Card", "Wallet", "Online"].map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <Input
                              type="number"
                              min="0"
                              placeholder="Amount"
                              value={row.amount}
                              onChange={(e) => {
                                const next = [...splitAmounts];
                                next[idx] = { ...next[idx], amount: e.target.value };
                                setSplitAmounts(next);
                              }}
                              className="h-7 flex-1 text-xs"
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSplitAmounts((prev) => [...prev, { method: "Cash", amount: "" }])}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          + Add split
                        </button>
                        <p className="text-[10px] text-muted-foreground">Must total {formatCurrency(estimatedTotal, currency)}</p>
                      </div>
                    )}
                  </div>

                  {/* Discount */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Discount</Label>
                    <div className="flex gap-2">
                      <div className="flex overflow-hidden rounded-md border text-xs">
                        {(["", "PERCENTAGE", "FIXED"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setDiscountType(t)}
                            className={cn(
                              "px-2.5 py-1.5 font-medium transition-colors",
                              discountType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
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
                          className="h-8 flex-1 text-sm"
                        />
                      )}
                    </div>
                  </div>

                  {/* Special Instructions / Notes */}
                  <div className="space-y-1">
                    <Label className="text-xs">Special Instructions</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." className="h-8 text-sm" />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {QUICK_NOTES.map((phrase) => (
                        <button
                          key={phrase}
                          type="button"
                          onClick={() => addQuickNote(phrase)}
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                        >
                          + {phrase}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Reference Number</Label>
                      <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Coupon Code</Label>
                      <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                    </div>
                  </div>

                  <div className="space-y-1 rounded-md border border-dashed bg-muted/30 p-2.5">
                    <Label className="text-xs">Internal Staff Notes</Label>
                    <Textarea
                      value={internalStaffNotes}
                      onChange={(e) => setInternalStaffNotes(e.target.value)}
                      placeholder="Only visible to staff on this device — never saved to the order or shown to the customer."
                      className="min-h-14 bg-background text-xs"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </main>

      {/* Footer */}
      <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 border-t bg-background/98 px-5 py-3 backdrop-blur-sm">
        <div className="text-sm">
          {cart.length > 0 ? (
            <>
              <span className="font-medium">{totalQty} items</span>
              <span className="text-muted-foreground"> · {formatCurrency(estimatedTotal, currency)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No items</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleLeave()} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || cart.length === 0}>
            {submitting ? "Creating..." : "Create Order"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear the cart?"
        description={`This removes all ${totalQty} item(s) currently added. This can't be undone.`}
        confirmLabel="Clear cart"
        destructive
        onConfirm={handleClearCart}
      />

      {addItemsOpen && (
        <AddItemsPanel
          currency={currency}
          products={products}
          loadingProducts={loadingProducts}
          catalogLoadedAt={catalogLoadedAt}
          cart={cart}
          popularProductIds={popularProductIds}
          recentlyViewedIds={recentlyViewedIds}
          recentSearches={recentSearches}
          onAddToCart={addToCart}
          onUpdateQty={updateQty}
          onCommitSearch={commitSearch}
          onClose={() => setAddItemsOpen(false)}
        />
      )}
    </div>
  );
}
