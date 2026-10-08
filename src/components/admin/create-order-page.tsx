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
  ScanLine,
  User,
  CheckCircle2,
  Printer,
  MessageCircle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddItemsPanel } from "@/components/admin/add-items-panel";
import { ScanItemsPanel } from "@/components/admin/scan-items-panel";
import { CustomerPickerPanel, type CustomerSelection } from "@/components/admin/customer-picker-panel";
import { api, ApiError } from "@/lib/api-client";
import { calculateBill } from "@/lib/services/billing";
import { applyOffer } from "@/lib/services/pricing";
import { buildOrderMessage, buildWhatsAppUrl } from "@/lib/services/whatsapp";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { readLocalStore, writeLocalStore, clearLocalStore } from "@/lib/utils/local-store";
import type { TableBoardEntry } from "@/lib/services/table-session";
import {
  type Product,
  type CartItem,
  type Tax,
  type PartyLite,
  type PaymentMethod,
  type ItemSettings,
  PAYMENT_METHODS,
  getBarcodeDetectorCtor,
} from "@/lib/types/manual-order";

// Same status-label color language as tables-board.tsx's LABEL_BADGE, so the
// table dropdown here reads consistently with the Tables board.
const TABLE_LABEL_BADGE: Record<string, string> = {
  Preparing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Served: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Awaiting payment": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";

const QUICK_NOTES = ["No onions", "Extra spicy", "Less oil", "No dairy", "Contactless"];
const MAX_RECENT_SEARCHES = 5;
const MAX_RECENTLY_VIEWED = 8;
const MAX_RECENT_CUSTOMERS = 6;
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

interface ChargeRow {
  label: string;
  amount: string;
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
  charges: ChargeRow[];
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
  initialTableNumber,
  showProductImages = true,
  returnToHistory = false,
  businessName,
}: {
  currency: string;
  shopSlug: string;
  initialOrderType?: OrderType;
  initialTableNumber?: string;
  showProductImages?: boolean;
  // true when this flow was entered via Order History's "+ Create Order"
  // button — on success, land back there instead of the order detail page.
  // Default (false) keeps every other existing entry point's behavior
  // unchanged (e.g. the Cash Counter's link into this same page).
  returnToHistory?: boolean;
  // Desktop-only header sublabel (section 4) — optional so every existing
  // call site keeps working unchanged without passing it.
  businessName?: string;
}) {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  // The real Customer/Party ledger (outstanding balance, order count) — see
  // customer-picker-panel.tsx. Replaces the old order-history-derived
  // "customers" directory so the Customer card can show due balance/order
  // count, matching the Parties page's own numbers exactly.
  const [parties, setParties] = useState<PartyLite[]>([]);
  const [loadingParties, setLoadingParties] = useState(true);
  const [tables, setTables] = useState<TableBoardEntry[]>([]);
  const [popularProductIds, setPopularProductIds] = useState<string[]>([]);
  const [itemSettings, setItemSettings] = useState<ItemSettings | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  // Set inside the products fetch's .then() below (never read Date.now()
  // during render — React's purity rules disallow it) — passed down so the
  // "New" product badge has a stable reference point.
  const [catalogLoadedAt, setCatalogLoadedAt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [addItemsOpen, setAddItemsOpen] = useState(!!initialTableNumber);
  const [scanItemsOpen, setScanItemsOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  // Snapshot of the party selected via the Customer card/picker — kept
  // separate from customerName/customerPhone (still the fields actually
  // submitted) purely so the card can show outstanding/order-count without
  // re-deriving them from `parties` on every render once a free-typed phone
  // no longer matches anything.
  const [selectedParty, setSelectedParty] = useState<PartyLite | null>(null);
  // Set once an order is successfully created — switches the page into the
  // dedicated success screen (section 20) instead of auto-navigating away,
  // so double-confirmation and the View/Print/WhatsApp/New-Order actions all
  // have one obvious place to live.
  const [successOrder, setSuccessOrder] = useState<{
    orderId: string;
    billNumber: string;
    tokenNumber: number | null;
    customerName: string;
    customerPhone: string;
    total: number;
    itemCount: number;
    readyForPayment: boolean;
  } | null>(null);
  const barcodeScanSupported = useMemo(
    () =>
      getBarcodeDetectorCtor() !== null &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    []
  );

  // Form state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType ?? "DINE_IN");
  const [tableNumber, setTableNumber] = useState(initialTableNumber ?? "");
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
  // Additional charges (delivery/packaging/service/etc) — deliberately kept
  // out of calculateBill/bill.grandTotal (see billing.ts's getPayableTotal
  // doc comment): they're added to the amount the customer actually pays,
  // never folded into the sticker-price total revenue reports read.
  const [charges, setCharges] = useState<ChargeRow[]>([]);
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
  const [recentCustomerPhones, setRecentCustomerPhones] = useState<string[]>(() =>
    readLocalStore(shopSlug, "recentCustomers", [] as string[])
  );
  const [customerNotesMap, setCustomerNotesMap] = useState<Record<string, string>>(() =>
    readLocalStore(shopSlug, "customerNotes", {} as Record<string, string>)
  );
  const [showCustomerNotes, setShowCustomerNotes] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [draftBanner, setDraftBanner] = useState<DraftOrder | null>(null);

  // Read-only preview of what's already on an occupied table — lets the
  // owner see the running order before adding to it, same visibility a
  // customer already gets when they scan the QR at that table.
  const [occupiedTablePreview, setOccupiedTablePreview] = useState<{
    items: { name: string; quantity: number }[];
    grandTotal: number;
    label: string;
  } | null>(null);
  const [loadingTablePreview, setLoadingTablePreview] = useState(false);

  const pendingDuplicateRef = useRef<DuplicateOrderData | null>(null);
  const hasCheckedDuplicateRef = useRef(false);
  // Idempotency key (section 19) — one per in-progress order, sent as
  // clientRequestId on every submit attempt including retries. Regenerated
  // only when the cart is actually reset (Create New Order / cleared), so a
  // double-click or a retried request after a dropped response always maps
  // to the same key and the server-side @@unique([shopId, clientRequestId])
  // guarantees at most one Order row for it.
  const clientRequestIdRef = useRef<string>("");

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

  // Generated on mount (not during render — see clientRequestIdRef's own
  // comment and startNewOrder, which regenerates it the same way) rather
  // than as this ref's lazy initial value, since calling crypto.randomUUID()
  // during render is impure/disallowed.
  useEffect(() => {
    if (!clientRequestIdRef.current) clientRequestIdRef.current = crypto.randomUUID();
  }, []);

  // One-shot: announce arriving here with a table pre-selected (from tapping
  // an available table on the Tables board) — deliberately not re-fired on
  // later manual table changes, so [] deps (not [initialTableNumber]) is
  // correct here, not a missing-dep bug.
  useEffect(() => {
    if (initialTableNumber) toast.success(`Creating order for Table ${initialTableNumber}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-called after a successful order (section 26: data refresh) so stock
  // numbers on the grid and Party outstanding/order-count are current for
  // the very next sale — without this, "Create New Order" would keep
  // showing pre-sale stock until a full page reload.
  function loadProducts() {
    return api
      .get<Product[]>("/api/admin/products")
      .then((data) => {
        setProducts(data.filter((p) => p.isAvailable && p.isVisible));
        setCatalogLoadedAt(Date.now());
      })
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setLoadingProducts(false));
  }
  function loadParties() {
    return api
      .get<PartyLite[]>("/api/admin/parties")
      .then(setParties)
      .catch(() => {})
      .finally(() => setLoadingParties(false));
  }

  useEffect(() => {
    loadProducts();
    api
      .get<Tax[]>("/api/admin/taxes")
      // Decimal fields serialize as strings over JSON — convert before use.
      .then((data) => setTaxes(data.filter((t) => t.isEnabled).map((t) => ({ ...t, value: Number(t.value) }))))
      .catch(() => {});
    loadParties();
    api
      .get<{ productId: string; orderCount: number }[]>("/api/admin/products/stats")
      .then((rows) => setPopularProductIds(rows.map((r) => r.productId)))
      .catch(() => {});
    api
      .get<{ tables: TableBoardEntry[] }>("/api/admin/table-sessions")
      .then((res) => setTables(res.tables))
      .catch(() => {});
    // Drives which optional fields (MRP, product code, …) the desktop POS
    // grid card is allowed to show — see ItemSettings in schema.prisma.
    // Absent on failure just means the card stays conservative (no optional
    // fields), never fabricated.
    api
      .get<ItemSettings>("/api/admin/item-settings")
      .then(setItemSettings)
      .catch(() => {});
  }, []);

  // Whenever an occupied table is selected, load what's already on it so the
  // owner can see the running order before adding to it.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (orderType !== "DINE_IN" || !tableNumber) {
        if (!cancelled) setOccupiedTablePreview(null);
        return;
      }
      const table = tables.find((t) => t.tableNumber === tableNumber);
      if (!table?.occupied || !table.session) {
        if (!cancelled) setOccupiedTablePreview(null);
        return;
      }
      const session = table.session;
      // This table already has an open tab — new items must join it, never
      // settle as a separate sale, or the customer ends up with two bills
      // for one visit. Locked in the UI too (see Payment Method section).
      setPaymentMethod("PENDING");
      setLoadingTablePreview(true);
      try {
        const detail = await api.get<{
          orders: { status: string; items: { productId: string | null; name: string; quantity: number }[] }[];
        }>(`/api/admin/table-sessions/${session.id}`);
        if (cancelled) return;
        const map = new Map<string, { name: string; quantity: number }>();
        detail.orders
          .filter((o) => o.status !== "CANCELLED")
          .flatMap((o) => o.items)
          .forEach((item) => {
            const key = item.productId ?? item.name;
            const existing = map.get(key);
            map.set(key, { name: item.name, quantity: (existing?.quantity ?? 0) + item.quantity });
          });
        setOccupiedTablePreview({ items: Array.from(map.values()), grandTotal: session.grandTotal, label: session.label });
      } catch {
        if (!cancelled) setOccupiedTablePreview(null);
      } finally {
        if (!cancelled) setLoadingTablePreview(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tableNumber, orderType, tables]);

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

  // Whenever the phone currently set matches a known Party — whether that
  // came from the picker or was free-typed directly — resolve it live so
  // the Customer card's outstanding/order-count never goes stale relative
  // to `parties`. Falls back to the picker's own snapshot (selectedParty)
  // when the phone doesn't match anything in the loaded directory yet.
  const matchedParty = useMemo(() => {
    const phone = customerPhone.trim();
    if (!phone) return null;
    return parties.find((p) => p.phone === phone) ?? (selectedParty?.phone === phone ? selectedParty : null);
  }, [parties, customerPhone, selectedParty]);

  const isWalkIn = !customerName.trim() && !customerPhone.trim();

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
      charges,
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
    setCharges(draftBanner.charges ?? []);
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

  function pushRecentCustomer(phone: string) {
    if (!phone) return;
    setRecentCustomerPhones((prev) => {
      const next = [phone, ...prev.filter((p) => p !== phone)].slice(0, MAX_RECENT_CUSTOMERS);
      writeLocalStore(shopSlug, "recentCustomers", next);
      return next;
    });
  }

  // Single entry point for every way a customer can be chosen (search
  // result, recent, Add New Customer) — `null` means Walk-in Customer
  // (section 2's default). Never touches the cart, matching section 2's
  // "customer selection is independent of items" framing.
  function handleCustomerSelect(selection: CustomerSelection | null) {
    if (!selection) {
      setCustomerName("");
      setCustomerPhone("");
      setSelectedParty(null);
      setCustomerPickerOpen(false);
      return;
    }
    setCustomerName(selection.name);
    setCustomerPhone(selection.phone);
    setSelectedParty(selection.party ?? null);
    pushRecentCustomer(selection.phone);
    setCustomerPickerOpen(false);
  }

  function handlePartyCreated(party: PartyLite) {
    setParties((prev) => [party, ...prev]);
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

  // Shared by the grid's "+ Add" button, the cart's "+" stepper, and the
  // barcode scanner handoff — blocks exceeding on-hand stock client-side
  // (section 17) unless this shop's Item Settings explicitly allow
  // negative-stock selling, matching the same flag the order-creation API
  // enforces server-side (never trust only the frontend check).
  function stockBlockMessage(productId: string, addingQty: number): string | null {
    if (itemSettings?.allowNegativeStock) return null;
    const product = products.find((p) => p.id === productId);
    if (!product || typeof product.stock !== "number") return null;
    const currentQty = cart.find((i) => i.productId === productId)?.quantity ?? 0;
    if (currentQty + addingQty > product.stock) {
      return product.stock <= 0
        ? `${product.name} is out of stock.`
        : `Insufficient stock for ${product.name} — only ${product.stock} available.`;
    }
    return null;
  }

  function addToCart(product: Product) {
    const blocked = stockBlockMessage(product.id, 1);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      // Item Master — apply the product's offer (if any) as the default
      // line price; staff can still freely override it (handlePriceInputChange
      // clears this snapshot the moment they do).
      const offer = applyOffer(Number(product.price), product.offerType, product.offerValue != null ? Number(product.offerValue) : null);
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: offer.finalPrice,
          quantity: 1,
          categoryId: product.category.id,
          categoryName: product.category.name,
          imageUrl: product.imageUrl,
          originalPrice: offer.discountAmount > 0 ? offer.originalPrice : null,
          offerDiscount: offer.discountAmount > 0 ? offer.discountAmount : null,
        },
      ];
    });
    pushRecentlyViewed(product.id);
  }

  function updateQty(productId: string, delta: number) {
    if (delta > 0) {
      const blocked = stockBlockMessage(productId, delta);
      if (blocked) {
        toast.error(blocked);
        return;
      }
    }
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
      // A hand-typed price replaces whatever the automatic offer computed —
      // clear the snapshot so the invoice never shows a stale discount.
      setCart((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, price: parsed, originalPrice: null, offerDiscount: null } : i))
      );
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

  function addCharge(label = "") {
    setCharges((prev) => [...prev, { label, amount: "" }]);
  }

  function updateCharge(index: number, patch: Partial<ChargeRow>) {
    setCharges((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeCharge(index: number) {
    setCharges((prev) => prev.filter((_, i) => i !== index));
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

  // Only rows with both a label and a positive amount count toward the
  // total/submission — an in-progress "+ Add charge" row with an empty
  // label or amount is silently ignored rather than blocking checkout.
  const validCharges = useMemo(
    () =>
      charges
        .map((c) => ({ label: c.label.trim(), amount: parseFloat(c.amount) }))
        .filter((c): c is { label: string; amount: number } => !!c.label && Number.isFinite(c.amount) && c.amount > 0),
    [charges]
  );
  const chargesTotal = useMemo(() => validCharges.reduce((sum, c) => sum + c.amount, 0), [validCharges]);

  const estimatedTotal = Math.max(0, bill.grandTotal - discountAmount) + chargesTotal;
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
        items: cart.map(({ productId, name, price, quantity, categoryId, originalPrice, offerDiscount }) => ({
          productId,
          name,
          price,
          quantity,
          categoryId,
          ...(originalPrice != null ? { originalPrice } : {}),
          ...(offerDiscount != null ? { offerDiscount } : {}),
        })),
        paymentMethod,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        tableNumber: orderType === "DINE_IN" ? tableNumber.trim() || undefined : undefined,
        deliveryAddress: orderType === "DELIVERY" ? deliveryAddress.trim() || undefined : undefined,
        notes: effectiveNotes || undefined,
        // Idempotency key (section 19) — same key resent on every attempt
        // for this cart, so a double-click or a retried request after a
        // dropped response can never create a second Order row. Omitted
        // (never an empty string — the API's schema requires >=10 chars
        // when present) on the vanishingly unlikely chance the mount effect
        // that generates it hasn't run yet.
        ...(clientRequestIdRef.current ? { clientRequestId: clientRequestIdRef.current } : {}),
      };
      if (discountType && discountValue && parseFloat(discountValue) > 0) {
        body.discountType = discountType;
        body.discountValue = parseFloat(discountValue);
      }
      if (validCharges.length > 0) {
        body.charges = validCharges;
      }

      const res = await api.post<{ billNumber: string; orderId: string; tokenNumber: number | null }>(
        "/api/admin/orders",
        body,
        15_000
      );
      clearLocalStore(shopSlug, "draftOrder");

      // Skip the manual "Confirm Order" review step and go straight to
      // Payment — same backend transition the Confirm Order button always
      // did (PENDING -> CONFIRMED), just run automatically right after
      // creation instead of waiting for a separate click. A table order
      // added to an already-open tab (Payment Method locked to Pending,
      // see occupiedTablePreview above) is excluded: that payment is
      // deliberately deferred until the whole table is settled later, so it
      // keeps landing on the normal review screen.
      let readyForPayment = false;
      if (paymentMethod !== "PENDING") {
        try {
          await api.patch(`/api/admin/orders/${res.orderId}`, { action: "status", status: "CONFIRMED" });
          readyForPayment = true;
        } catch {
          // Auto-confirm failed (e.g. transient network error) — fall back
          // to the normal review screen rather than blocking navigation.
        }
      }

      // Land on the dedicated success screen (section 20) instead of
      // auto-navigating away — its own View/Print/WhatsApp/New-Order actions
      // decide where to go next.
      setSuccessOrder({
        orderId: res.orderId,
        billNumber: res.billNumber,
        tokenNumber: res.tokenNumber,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        total: estimatedTotal,
        itemCount: totalQty,
        readyForPayment,
      });
      // Refresh stock numbers and Party outstanding/order-count so they're
      // correct the moment this success screen is dismissed — not just on a
      // future hard refresh (section 26).
      loadProducts();
      loadParties();
    } catch (err) {
      toast.error(describeOrderError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Meaningful, specific error copy (section 18) — never the bare generic
  // "Something went wrong" the brief calls out, and never a raw
  // database/API message either. ApiError messages originating from the
  // server (stock/customer/validation errors already phrased clearly by the
  // API — see handleApiError) are passed through as-is; everything else maps
  // to one of the known categories.
  function describeOrderError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 409 && /already.*created|duplicate/i.test(err.message)) {
        return "This order may already have been created. Please check Order History.";
      }
      if (err.status >= 500) {
        return "Order could not be created. Please try again.";
      }
      // 400/404/409 etc. — the server already phrased this specifically
      // (insufficient stock, unavailable product, invalid table, ...).
      return err.message || "Order could not be created. Please try again.";
    }
    if (err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message))) {
      return "Connection lost. Please check your internet connection and try again.";
    }
    return "Order could not be created. Please try again.";
  }

  // Resets only the in-progress POS/cart state (section 21) — never touches
  // the customer/product/order/stock/report data those live in the backend.
  function startNewOrder() {
    setCart([]);
    setPriceInputs({});
    setCustomerName("");
    setCustomerPhone("");
    setSelectedParty(null);
    setNotes("");
    setReferenceNumber("");
    setCouponCode("");
    setDeliveryAddress("");
    setDeliveryInstructions("");
    setInternalStaffNotes("");
    setDiscountType("");
    setDiscountValue("");
    setCharges([]);
    setPaymentMethod("CASH");
    clientRequestIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `cr_${Date.now()}_${Math.random()}`;
    setSuccessOrder(null);
  }

  function shareOrderOnWhatsApp() {
    if (!successOrder?.customerPhone) return;
    const message = buildOrderMessage({
      customerName: successOrder.customerName || undefined,
      customerPhone: successOrder.customerPhone || undefined,
      items: cart,
      bill,
      currency,
    });
    const win = window.open(buildWhatsAppUrl(successOrder.customerPhone, message), "_blank");
    if (!win) toast.error("WhatsApp could not be opened. Please check WhatsApp installation or try again.");
  }

  // Customer card (section 2) — top of the order, independent of the
  // Additional Details accordion. Walk-in by default; once a customer is
  // selected (via the picker, or a free-typed phone that happens to match a
  // known Party) shows their outstanding balance / order count straight
  // from the real Party ledger, never a guessed/derived figure.
  function renderCustomerCard() {
    return (
      <div className="space-y-2 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        {isWalkIn ? (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Walk-in Customer</p>
              <p className="text-xs text-muted-foreground">General Counter Sale</p>
            </div>
          </>
        ) : (
          <>
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", avatarColor(customerName || customerPhone))}>
              {initialsOf(customerName || "?")}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sm font-semibold">{customerName || "Unnamed customer"}</p>
              <p className="truncate text-xs text-muted-foreground">{customerPhone || "No mobile number"}</p>
              {matchedParty && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {matchedParty.outstanding > 0 && (
                    <Badge variant="outline" className="border-amber-300 text-amber-600 text-[10px]">
                      Due {formatCurrency(matchedParty.outstanding, currency)}
                    </Badge>
                  )}
                  {matchedParty.orderCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {matchedParty.orderCount} previous order{matchedParty.orderCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}
              {matchedParty && (
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowCustomerNotes((v) => !v)}
                    className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Notes <ChevronDown className={cn("size-3 transition-transform", showCustomerNotes && "rotate-180")} />
                  </button>
                  <a
                    href={`/admin/orders?q=${encodeURIComponent(customerPhone.trim())}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    Order history <ExternalLink className="size-2.5" />
                  </a>
                </div>
              )}
            </div>
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => setCustomerPickerOpen(true)} className="shrink-0">
          Change
        </Button>
      </div>
      {matchedParty && showCustomerNotes && (
        <textarea
          defaultValue={customerNotesMap[customerPhone.trim()] ?? ""}
          onBlur={(e) => saveCustomerNote(customerPhone.trim(), e.target.value)}
          placeholder="e.g. Regular customer, prefers less spicy…"
          className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring"
          rows={2}
        />
      )}
      </div>
    );
  }

  // Customer / order type / table / payment / discount / charges / notes —
  // defined once, rendered twice by the JSX below: inside a collapsible
  // Accordion on mobile (unchanged behavior), and inside an always-expanded
  // plain card on desktop (section 12-19). Keeping this as a single closure
  // over the component's own state means every field keeps exactly one
  // implementation regardless of how many breakpoints render it.
  function renderOrderDetailsFields() {
    return (
      <>
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
            {tables.length === 0 ? (
              <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. Table 4" className="h-8 text-sm" />
            ) : (
              <Select
                value={tableNumber}
                onValueChange={(v) => v && setTableNumber(v as string)}
              >
                <SelectTrigger className="h-8 w-full text-sm" size="sm">
                  <SelectValue placeholder="Select Table">
                    {(value: string | null) => (value ? `Table ${value}` : "Select Table")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => {
                    const manualLabel =
                      t.manualState === "RESERVED" ? "Reserved" : t.manualState === "CLEANING" ? "Cleaning" : "Disabled";
                    const label = t.occupied && t.session ? t.session.label : t.manualState ? manualLabel : "Available";
                    const disabled = !t.occupied && (t.manualState === "DISABLED" || t.manualState === "CLEANING");
                    return (
                      <SelectItem key={t.tableNumber} value={t.tableNumber} disabled={disabled}>
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span>Table {t.tableNumber}</span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              t.occupied
                                ? TABLE_LABEL_BADGE[label]
                                : t.manualState
                                  ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )}
                          >
                            {label}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            {loadingTablePreview && (
              <p className="text-xs text-muted-foreground">Loading this table&apos;s current order…</p>
            )}
            {occupiedTablePreview && (
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
                <div className="flex items-center justify-between font-medium">
                  <span>Already on this table — {occupiedTablePreview.label}</span>
                  <span>{formatCurrency(occupiedTablePreview.grandTotal, currency)}</span>
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {occupiedTablePreview.items.map((item) => (
                    <li key={item.name}>
                      {item.quantity}× {item.name}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">
                  New items you add below will join this table&apos;s running order — Payment Method is locked
                  to Pending so this can&apos;t become a separate bill for the same visit.
                </p>
              </div>
            )}
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
          {occupiedTablePreview && (
            <p className="text-xs text-muted-foreground">
              Locked to Pending — this table already has an open tab.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPaymentMethod(m.value)}
                disabled={!!occupiedTablePreview && m.value !== "PENDING"}
                aria-pressed={paymentMethod === m.value}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  paymentMethod === m.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                  !!occupiedTablePreview && m.value !== "PENDING" && "opacity-40 cursor-not-allowed hover:bg-transparent"
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

        {/* Additional Charges */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Additional Charges</Label>
            <button
              type="button"
              onClick={() => addCharge()}
              className="text-xs font-medium text-primary hover:underline"
            >
              + Add charge
            </button>
          </div>
          {charges.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              e.g. delivery, packaging, or service charge — shown separately from the item total.
            </p>
          ) : (
            <div className="space-y-1.5">
              {charges.map((charge, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <Input
                    value={charge.label}
                    onChange={(e) => updateCharge(index, { label: e.target.value })}
                    placeholder="e.g. Delivery charge"
                    maxLength={40}
                    className="h-8 flex-1 text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={charge.amount}
                    onChange={(e) => updateCharge(index, { amount: e.target.value })}
                    placeholder="Amount"
                    className="h-8 w-24 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeCharge(index)}
                    aria-label="Remove charge"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:h-screen md:overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b bg-background/98 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => handleLeave()}
          aria-label="Back to orders"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Current Order (POS)</h1>
          {businessName && <p className="hidden truncate text-xs text-muted-foreground md:block">{businessName}</p>}
        </div>
        {barcodeScanSupported && (
          <button
            onClick={() => setScanItemsOpen(true)}
            className="hidden shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:flex"
          >
            <ScanLine className="size-3.5" /> Scanner
          </button>
        )}
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:flex dark:bg-emerald-900/30 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" /> ACTIVE
        </span>
        {/* Live summary — desktop only; same values the mobile footer already shows */}
        <div className="hidden shrink-0 text-sm md:block">
          {cart.length > 0 ? (
            <>
              <span className="font-medium">{totalQty} item{totalQty !== 1 ? "s" : ""}</span>
              <span className="text-muted-foreground"> · {formatCurrency(estimatedTotal, currency)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No items</span>
          )}
        </div>
      </header>

      {/* Desktop/tablet: product browser (left) + cart/checkout (right), each
          scrolling independently (section 15). Mobile keeps the single
          scrolling column below unchanged — every class added here is
          md:/pos:/pos-xl:-prefixed. */}
      <div className="flex-1 md:flex md:min-h-0 md:flex-row md:overflow-hidden">
        <section className="hidden md:flex md:min-w-0 md:flex-1 md:flex-col md:overflow-hidden md:border-r">
          <AddItemsPanel
            variant="inline"
            density="grid"
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
            onClose={() => {}}
            showImages={showProductImages}
            itemSettings={itemSettings}
          />
        </section>

        <div className="flex flex-1 flex-col md:min-h-0 md:w-[380px] pos:w-[400px] pos-xl:w-[440px] md:flex-none md:overflow-hidden">
      {/* Body */}
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 md:mx-0 md:max-w-none md:flex-1 md:overflow-y-auto">
        {renderCustomerCard()}

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
          <>
            {/* Mobile/tablet: no inline product pane yet, so give a way in */}
            <div className="space-y-2 md:hidden">
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-xl">
                  🛒
                </div>
                <p className="font-semibold">No products added yet</p>
                <p className="text-xs text-muted-foreground">Scan barcode or tap below to add items.</p>
              </div>
              <button
                onClick={() => setAddItemsOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <PackagePlus className="size-4" /> Add Product
              </button>
              {barcodeScanSupported && (
                <button
                  onClick={() => setScanItemsOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <ScanLine className="size-4" /> Scan Barcode
                </button>
              )}
            </div>
            {/* Desktop: the product grid is already visible on the left */}
            <div className="hidden flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-10 text-center md:flex">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-xl">
                🛒
              </div>
              <p className="font-semibold">No products added yet</p>
              <p className="text-xs text-muted-foreground">Tap a product on the left, or scan a barcode, to add it</p>
            </div>
          </>
        ) : (
          <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold">Order Items ({totalQty})</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAddItemsOpen(true)}
                  className="text-xs font-medium text-primary hover:underline md:hidden"
                >
                  + Add more
                </button>
                {barcodeScanSupported && (
                  <button
                    onClick={() => setScanItemsOpen(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    + Scan Items
                  </button>
                )}
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
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          {item.categoryName}
                          {item.offerDiscount != null && item.offerDiscount > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Offer -{formatCurrency(item.offerDiscount, currency)}
                            </span>
                          )}
                        </p>
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
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount</span>
                  <span>−{formatCurrency(discountAmount, currency)}</span>
                </div>
              )}
              {validCharges.map((c, i) => (
                <div key={`${c.label}-${i}`} className="flex justify-between text-sm text-muted-foreground">
                  <span>{c.label}</span>
                  <span>+{formatCurrency(c.amount, currency)}</span>
                </div>
              ))}
              {bill.taxLines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm text-muted-foreground">
                  <span>{line.name}</span>
                  <span>{formatCurrency(line.amount, currency)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
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

        {/* Additional Details — collapsed accordion on mobile/tablet */}
        <div className="rounded-2xl border bg-card px-4 shadow-sm md:hidden">
          <Accordion>
            <AccordionItem value="details" className="border-b-0">
              <AccordionTrigger>Additional Details</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">{renderOrderDetailsFields()}</div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Order Details — always expanded on desktop (section 12-19); same
            fields/handlers as the mobile accordion above, via
            renderOrderDetailsFields(). */}
        <div className="hidden rounded-2xl border bg-card p-4 shadow-sm md:block">
          <h2 className="mb-3 text-sm font-semibold">Order Details</h2>
          <div className="space-y-4">{renderOrderDetailsFields()}</div>
        </div>
      </main>

      {/* Footer — pinned to the bottom of this cart column; on mobile this
          column is the full page so it reads identically to before */}
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
            {submitting ? "Creating Order..." : "Confirm Order"}
          </Button>
        </div>
      </div>
        </div>
      </div>

      {customerPickerOpen && (
        <CustomerPickerPanel
          currency={currency}
          parties={parties}
          loadingParties={loadingParties}
          recentPhones={recentCustomerPhones}
          onSelect={handleCustomerSelect}
          onPartyCreated={handlePartyCreated}
          onClose={() => setCustomerPickerOpen(false)}
        />
      )}

      {successOrder && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 text-center shadow-xl">
            <div className="flex flex-col items-center gap-2">
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="size-8" />
              </span>
              <h2 className="text-lg font-semibold">Order Created Successfully</h2>
            </div>

            <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Number</span>
                <span className="font-mono font-semibold">
                  #{successOrder.billNumber}
                  {successOrder.tokenNumber ? ` · Token #${successOrder.tokenNumber}` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{successOrder.customerName || "Walk-in Customer"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium">{successOrder.itemCount}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(successOrder.total, currency)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  router.push(
                    `/admin/orders/${successOrder.orderId}?created=1${successOrder.readyForPayment ? "&pay=1" : ""}`
                  )
                }
              >
                View Order
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/admin/orders/${successOrder.orderId}?created=1&autoprint=1`)
                }
              >
                <Printer className="size-4" /> Print Invoice
              </Button>
              {successOrder.customerPhone ? (
                <Button variant="outline" onClick={shareOrderOnWhatsApp} className="col-span-2">
                  <MessageCircle className="size-4" /> Send WhatsApp
                </Button>
              ) : null}
              <Button onClick={startNewOrder} className="col-span-2">
                Create New Order
              </Button>
            </div>

            {returnToHistory && (
              <button
                onClick={() => router.push("/admin/orders")}
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                Back to Order History
              </button>
            )}
          </div>
        </div>
      )}

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
          showImages={showProductImages}
        />
      )}

      {scanItemsOpen && (
        <ScanItemsPanel
          currency={currency}
          products={products}
          onAddToCart={addToCart}
          onClose={() => setScanItemsOpen(false)}
        />
      )}
    </div>
  );
}
