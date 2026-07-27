"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Plus,
  Minus,
  Search,
  X,
  ShoppingCart,
  Mic,
  ScanLine,
  Star,
  Sparkles,
  Flame,
  AlertTriangle,
  ImageOff,
  ExternalLink,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { calculateBill } from "@/lib/services/billing";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { readLocalStore, writeLocalStore, clearLocalStore } from "@/lib/utils/local-store";

type PaymentMethod = "CASH" | "UPI" | "CARD" | "ONLINE" | "WALLET" | "SPLIT" | "PENDING";

interface Product {
  id: string;
  name: string;
  price: number;
  category: { id: string; name: string };
  isAvailable: boolean;
  isVisible: boolean;
  imageUrl?: string | null;
  foodType?: "VEG" | "NON_VEG" | "NA";
  stock?: number | null;
  createdAt?: string;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  categoryId: string;
}

interface Tax {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  appliesTo: "ENTIRE_BILL" | "CATEGORY";
  categoryId: string | null;
  isEnabled: boolean;
}

// There's no separate Customer model — this is the most recent order per
// distinct phone number, standing in for a lightweight customer directory.
interface PastCustomer {
  customerName: string | null;
  customerPhone: string | null;
}

// Pre-fill payload for the "Duplicate Order" action on the orders list.
// Items are resolved against the currently-loaded product catalog (below) so
// a duplicated order always reflects live prices/categories, and items whose
// product was since deleted are skipped rather than fabricated.
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
  tableNumber: string;
  notes: string;
  paymentMethod: PaymentMethod;
  discountType: "PERCENTAGE" | "FIXED" | "";
  discountValue: string;
  savedAt: string;
}

interface Props {
  currency: string;
  shopSlug: string;
  onCreated?: () => void;
  // Set by the orders list's "Duplicate" action. openSignal is bumped every
  // time a duplicate is requested so the effect fires even if the same order
  // is duplicated twice in a row.
  initialData?: DuplicateOrderData | null;
  openSignal?: number;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
  { value: "WALLET", label: "Wallet" },
  { value: "SPLIT", label: "Split" },
  { value: "PENDING", label: "Pending" },
];

const QUICK_NOTES = ["No onions", "Extra spicy", "Less oil", "No dairy", "Contactless"];
const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LOW_STOCK_THRESHOLD = 5;
const MAX_RECENT_SEARCHES = 5;
const MAX_RECENTLY_VIEWED = 8;

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

// Wraps the substring of `text` that matches `query` in a <mark> — used for
// search-result highlighting. Returns a plain string when there's no match
// so callers can render it directly without an extra Fragment check.
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 px-0.5 text-inherit">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// Minimal ambient typings for two experimental Web APIs (SpeechRecognition,
// BarcodeDetector) not yet in TS's default DOM lib. Both are feature-detected
// before use, and the affordances that rely on them are hidden entirely when
// unsupported — never a broken button.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = new (options?: { formats: string[] }) => BarcodeDetectorLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

export function CreateOrderDialog({ currency, shopSlug, onCreated, initialData, openSignal }: Props) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [customers, setCustomers] = useState<PastCustomer[]>([]);
  const [popularProductIds, setPopularProductIds] = useState<string[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [tableNumber, setTableNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [splitAmounts, setSplitAmounts] = useState([
    { method: "Cash", amount: "" },
    { method: "UPI", amount: "" },
  ]);

  // Favorites / recents / notes — persisted per shop in the browser only.
  // Deliberately not synced to the server: these are personal quick-access
  // shortcuts for whoever is using this device, not shared business data.
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>(() =>
    readLocalStore(shopSlug, "favProducts", [] as string[])
  );
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() =>
    readLocalStore(shopSlug, "recentlyViewed", [] as string[])
  );
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readLocalStore(shopSlug, "recentSearches", [] as string[])
  );
  const [favoriteCustomerPhones, setFavoriteCustomerPhones] = useState<string[]>(() =>
    readLocalStore(shopSlug, "favCustomers", [] as string[])
  );
  const [customerNotesMap, setCustomerNotesMap] = useState<Record<string, string>>(() =>
    readLocalStore(shopSlug, "customerNotes", {} as Record<string, string>)
  );
  const [showCustomerNotes, setShowCustomerNotes] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [draftBanner, setDraftBanner] = useState<DraftOrder | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pendingDuplicateRef = useRef<DuplicateOrderData | null>(null);
  const lastOpenSignal = useRef(openSignal);

  const voiceSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);
  const barcodeSupported = useMemo(
    () =>
      getBarcodeDetectorCtor() !== null &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    []
  );

  // Open (and pre-fill) when the orders list requests a duplicate.
  useEffect(() => {
    if (openSignal === undefined || openSignal === lastOpenSignal.current) return;
    lastOpenSignal.current = openSignal;
    if (initialData) {
      pendingDuplicateRef.current = initialData;
      setDraftBanner(null);
    }
    setOpen(true);
  }, [openSignal, initialData]);

  useEffect(() => {
    if (!open) return;
    setLoadingProducts(true);
    api
      .get<Product[]>("/api/admin/products")
      .then((data) => setProducts(data.filter((p) => p.isAvailable && p.isVisible)))
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
  }, [open]);

  // Offer to resume a saved draft only on a fresh open with an empty cart —
  // a duplicate-order request takes priority and skips this.
  useEffect(() => {
    if (!open || pendingDuplicateRef.current) return;
    const draft = readLocalStore<DraftOrder | null>(shopSlug, "draftOrder", null);
    if (draft && draft.cart.length > 0) setDraftBanner(draft);
  }, [open, shopSlug]);

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

  // Release the camera/mic if the component unmounts mid-scan/listen.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
    };
  }, []);

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
    setSplitAmounts([{ method: "Cash", amount: "" }, { method: "UPI", amount: "" }]);
    setShowCustomerNotes(false);
    setDraftBanner(null);
  }

  const customerMatches = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    const pool = q
      ? customers.filter(
          (c) => (c.customerName ?? "").toLowerCase().includes(q) || (c.customerPhone ?? "").includes(q)
        )
      : customers.slice(0, 20);
    // Favorited customers float to the top regardless of recency.
    const sorted = [...pool].sort((a, b) => {
      const aFav = favoriteCustomerPhones.includes(a.customerPhone ?? "") ? 1 : 0;
      const bFav = favoriteCustomerPhones.includes(b.customerPhone ?? "") ? 1 : 0;
      return bFav - aFav;
    });
    return sorted.slice(0, 6);
  }, [customers, customerName, favoriteCustomerPhones]);

  const matchedCustomer = useMemo(() => {
    const phone = customerPhone.trim();
    if (!phone) return null;
    return customers.find((c) => c.customerPhone === phone) ?? null;
  }, [customers, customerPhone]);

  function handleClose(opts?: { skipDraftSave?: boolean }) {
    if (opts?.skipDraftSave) {
      clearLocalStore(shopSlug, "draftOrder");
    } else if (cart.length > 0) {
      const draft: DraftOrder = {
        cart,
        customerName,
        customerPhone,
        tableNumber,
        notes,
        paymentMethod,
        discountType,
        discountValue,
        savedAt: new Date().toISOString(),
      };
      writeLocalStore(shopSlug, "draftOrder", draft);
    } else {
      clearLocalStore(shopSlug, "draftOrder");
    }
    setOpen(false);
    resetForm();
  }

  function resumeDraft() {
    if (!draftBanner) return;
    setCart(draftBanner.cart);
    setCustomerName(draftBanner.customerName);
    setCustomerPhone(draftBanner.customerPhone);
    setTableNumber(draftBanner.tableNumber);
    setNotes(draftBanner.notes);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

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

  function toggleFavoriteProduct(productId: string) {
    setFavoriteProductIds((prev) => {
      const next = prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId];
      writeLocalStore(shopSlug, "favProducts", next);
      return next;
    });
  }

  function toggleFavoriteCustomer(phone: string) {
    if (!phone) return;
    setFavoriteCustomerPhones((prev) => {
      const next = prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone];
      writeLocalStore(shopSlug, "favCustomers", next);
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
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: product.id, name: product.name, price: Number(product.price), quantity: 1, categoryId: product.category.id }];
    });
    pushRecentlyViewed(product.id);
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
    const removed = cart.find((i) => i.productId === productId);
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    if (removed) {
      toast(`Removed ${removed.name}`, {
        action: { label: "Undo", onClick: () => setCart((prev) => [...prev, removed]) },
      });
    }
  }

  function handleClearCart() {
    setCart([]);
    setShowClearConfirm(false);
    toast("Cart cleared");
  }

  function addQuickNote(phrase: string) {
    setNotes((prev) => (prev.trim() ? `${prev.trim()}, ${phrase}` : phrase));
  }

  function startVoiceSearch() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        setSearch(transcript);
        commitSearch(transcript);
      }
    };
    recognition.onerror = () => setVoiceListening(false);
    recognition.onend = () => setVoiceListening(false);
    recognitionRef.current = recognition;
    setVoiceListening(true);
    recognition.start();
  }

  function stopVoiceSearch() {
    recognitionRef.current?.stop();
    setVoiceListening(false);
  }

  async function openScanner() {
    setScannerError(null);
    setScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      runBarcodeDetectLoop();
    } catch {
      setScannerError("Camera access denied or unavailable.");
    }
  }

  function closeScanner() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScannerOpen(false);
  }

  function runBarcodeDetectLoop() {
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"] });
    const tick = async () => {
      if (!streamRef.current || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          setSearch(codes[0].rawValue);
          commitSearch(codes[0].rawValue);
          closeScanner();
          return;
        }
      } catch {
        // transient decode failure on this frame — keep trying
      }
      if (streamRef.current) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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

    let effectiveNotes = notes.trim();
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
        items: cart,
        paymentMethod,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        notes: effectiveNotes || undefined,
      };
      if (discountType && discountValue && parseFloat(discountValue) > 0) {
        body.discountType = discountType;
        body.discountValue = parseFloat(discountValue);
      }

      const res = await api.post<{ billNumber: string; orderId: string }>("/api/admin/orders", body);
      toast.success(`Order ${res.billNumber} created — ${totalQty} item(s)`);
      handleClose({ skipDraftSave: true });
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  function productBadges(product: Product) {
    const isNew = product.createdAt && Date.now() - new Date(product.createdAt).getTime() < NEW_BADGE_WINDOW_MS;
    const rank = popularProductIds.indexOf(product.id);
    const isBestSeller = rank === 0;
    const isPopular = rank > 0 && rank < 5;
    const lowStock = typeof product.stock === "number" && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;
    const outOfStock = typeof product.stock === "number" && product.stock <= 0;

    return (
      <div className="flex flex-wrap items-center gap-1">
        {product.foodType === "VEG" && (
          <span className="flex size-3 items-center justify-center rounded-sm border border-emerald-600 p-[1px]" title="Veg" aria-label="Veg">
            <span className="size-full rounded-[1px] bg-emerald-600" />
          </span>
        )}
        {product.foodType === "NON_VEG" && (
          <span className="flex size-3 items-center justify-center rounded-sm border border-red-600 p-[1px]" title="Non-Veg" aria-label="Non-Veg">
            <span className="size-full rounded-[1px] bg-red-600" />
          </span>
        )}
        {isBestSeller && (
          <Badge variant="outline" className="gap-0.5 border-amber-300 px-1.5 text-[10px] text-amber-600">
            <Flame className="size-2.5" /> Best Seller
          </Badge>
        )}
        {isPopular && (
          <Badge variant="outline" className="gap-0.5 border-orange-300 px-1.5 text-[10px] text-orange-600">
            <Flame className="size-2.5" /> Popular
          </Badge>
        )}
        {isNew && (
          <Badge variant="outline" className="gap-0.5 border-blue-300 px-1.5 text-[10px] text-blue-600">
            <Sparkles className="size-2.5" /> New
          </Badge>
        )}
        {outOfStock && (
          <Badge variant="outline" className="gap-0.5 border-red-300 px-1.5 text-[10px] text-red-600">
            <AlertTriangle className="size-2.5" /> Out of stock
          </Badge>
        )}
        {!outOfStock && lowStock && (
          <Badge variant="outline" className="gap-0.5 border-amber-300 px-1.5 text-[10px] text-amber-600">
            <AlertTriangle className="size-2.5" /> Low stock
          </Badge>
        )}
      </div>
    );
  }

  function renderProductRow(product: Product) {
    const inCart = cart.find((i) => i.productId === product.id);
    const isFavorite = favoriteProductIds.includes(product.id);
    return (
      <div
        key={product.id}
        className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/70"
      >
        <button
          type="button"
          onClick={() => toggleFavoriteProduct(product.id)}
          aria-label={isFavorite ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
          aria-pressed={isFavorite}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-amber-500"
        >
          <Star className={cn("size-4", isFavorite && "fill-amber-400 text-amber-500")} />
        </button>

        <div className="relative size-9 shrink-0 overflow-hidden rounded-md border bg-muted">
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.name} fill sizes="36px" className="object-cover" unoptimized />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageOff className="size-3.5 text-muted-foreground/50" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{highlightMatch(product.name, search)}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{formatCurrency(Number(product.price), currency)}</span>
            <span>·</span>
            <span className="truncate">{product.category.name}</span>
          </div>
          {productBadges(product)}
        </div>

        {inCart ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => updateQty(product.id, -1)}
              aria-label={`Decrease quantity of ${product.name}`}
              className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-6 text-center text-sm font-medium tabular-nums">{inCart.quantity}</span>
            <button
              onClick={() => updateQty(product.id, 1)}
              aria-label={`Increase quantity of ${product.name}`}
              className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
            >
              <Plus className="size-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => addToCart(product)}
            className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-all hover:bg-muted active:scale-95"
          >
            Add
          </button>
        )}
      </div>
    );
  }

  function quickPickChip(productId: string, key: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    return (
      <button
        key={key}
        onClick={() => addToCart(product)}
        className="shrink-0 rounded-full border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
      >
        {product.name}
      </button>
    );
  }

  const showQuickPicks = !search.trim() && !loadingProducts && products.length > 0;
  const favoriteChips = favoriteProductIds.slice(0, 8);
  const recentChips = recentlyViewedIds.filter((id) => !favoriteProductIds.includes(id)).slice(0, 8);
  const popularChips = popularProductIds.slice(0, 5);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="max-sm:fixed max-sm:right-5 max-sm:bottom-5 max-sm:z-40 max-sm:size-14 max-sm:rounded-full max-sm:p-0 max-sm:shadow-lg"
        aria-label="Create Order"
      >
        <Plus className="size-4 max-sm:size-6" /> <span className="max-sm:hidden" aria-hidden="true">Create Order</span>
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-5 pt-5 pb-3">
            <DialogTitle className="text-base font-semibold">Create Manual Order</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {draftBanner && (
              <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs">
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

            <div className="flex flex-col gap-0 divide-y md:flex-row md:divide-x md:divide-y-0">
              {/* Product Selection */}
              <div className="space-y-3 p-4 md:w-[55%]">
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Search products"
                      placeholder="Search products or scan barcode..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitSearch(search); }}
                      className="h-9 pr-8 pl-8"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                        className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                    {searchFocused && !search && recentSearches.length > 0 && (
                      <div className="absolute top-full left-0 z-20 mt-1 w-full rounded-lg border bg-popover p-1.5 shadow-md">
                        <p className="px-1.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Recent searches</p>
                        <div className="flex flex-wrap gap-1">
                          {recentSearches.map((s) => (
                            <button
                              key={s}
                              onMouseDown={(e) => { e.preventDefault(); setSearch(s); }}
                              className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {voiceSupported && (
                    <button
                      type="button"
                      onClick={voiceListening ? stopVoiceSearch : startVoiceSearch}
                      aria-label={voiceListening ? "Stop voice search" : "Voice search"}
                      aria-pressed={voiceListening}
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-muted",
                        voiceListening && "border-red-400 bg-red-50 text-red-600 dark:bg-red-900/20"
                      )}
                    >
                      <Mic className={cn("size-4", voiceListening && "animate-pulse")} />
                    </button>
                  )}
                  {barcodeSupported && (
                    <button
                      type="button"
                      onClick={openScanner}
                      aria-label="Scan barcode"
                      title="Scan barcode"
                      className="flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-muted"
                    >
                      <ScanLine className="size-4" />
                    </button>
                  )}
                </div>

                {showQuickPicks && (favoriteChips.length > 0 || recentChips.length > 0 || popularChips.length > 0) && (
                  <div className="space-y-1.5">
                    {favoriteChips.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" />
                        {favoriteChips.map((id) => quickPickChip(id, `fav-${id}`))}
                      </div>
                    )}
                    {popularChips.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        <Flame className="size-3 shrink-0 text-orange-500" />
                        {popularChips.map((id) => quickPickChip(id, `pop-${id}`))}
                      </div>
                    )}
                    {recentChips.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">Recent</span>
                        {recentChips.map((id) => quickPickChip(id, `rec-${id}`))}
                      </div>
                    )}
                  </div>
                )}

                {loadingProducts ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1">
                        <Skeleton className="size-9 rounded-md" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-2/3" />
                          <Skeleton className="h-3 w-1/3" />
                        </div>
                        <Skeleton className="h-6 w-12 rounded-md" />
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <Search className="size-6 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No products match &quot;{search}&quot;</p>
                    <button onClick={() => setSearch("")} className="text-xs font-medium text-primary hover:underline">
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="max-h-60 space-y-0.5 overflow-y-auto" role="list" aria-label="Products">
                    {filtered.map(renderProductRow)}
                  </div>
                )}
              </div>

              {/* Cart + Details */}
              <div className="space-y-4 p-4 md:w-[45%]">
                {/* Cart Summary */}
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <ShoppingCart className="mb-2 size-8 opacity-40" />
                    <p className="text-sm">No items added</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cart</span>
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" /> Clear cart
                      </button>
                    </div>
                    {cart.map((item) => (
                      <div key={item.productId} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate">{item.name}</span>
                        <span className="tabular-nums text-muted-foreground">×{item.quantity}</span>
                        <span className="w-16 text-right font-medium tabular-nums">
                          {formatCurrency(item.price * item.quantity, currency)}
                        </span>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          aria-label={`Remove ${item.name} from cart`}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <Separator className="my-2" />
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
                    <div className="flex justify-between text-sm font-bold">
                      <span>Est. Total</span>
                      <span>{formatCurrency(estimatedTotal, currency)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[11px] text-muted-foreground">Est. prep ~{estimatedPrepMinutes} min</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          paymentMethod === "PENDING"
                            ? "border-amber-300 text-amber-600"
                            : "border-emerald-300 text-emerald-600"
                        )}
                      >
                        {paymentMethod === "PENDING"
                          ? "Payment pending"
                          : `Pay via ${PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label}`}
                      </Badge>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Customer + Order Details */}
                <div className="space-y-3">
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
                            const isFav = favoriteCustomerPhones.includes(phone);
                            return (
                              <div
                                key={`${phone}-${i}`}
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
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setCustomerName(c.customerName || "");
                                    setCustomerPhone(phone);
                                    setShowCustomerSuggestions(false);
                                  }}
                                  className="flex min-w-0 flex-1 flex-col items-start"
                                >
                                  <span className="truncate font-medium">{c.customerName || "Unnamed"}</span>
                                  {phone && <span className="text-muted-foreground">{phone}</span>}
                                </button>
                                {phone && (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); toggleFavoriteCustomer(phone); }}
                                    aria-label={isFav ? "Unfavorite customer" : "Favorite customer"}
                                    aria-pressed={isFav}
                                    className="shrink-0 text-muted-foreground hover:text-amber-500"
                                  >
                                    <Star className={cn("size-3.5", isFav && "fill-amber-400 text-amber-500")} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                    </div>
                  </div>

                  {matchedCustomer && (
                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleFavoriteCustomer(customerPhone.trim())}
                          aria-label="Toggle favorite customer"
                          className="text-muted-foreground hover:text-amber-500"
                        >
                          <Star
                            className={cn(
                              "size-3.5",
                              favoriteCustomerPhones.includes(customerPhone.trim()) && "fill-amber-400 text-amber-500"
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCustomerNotes((v) => !v)}
                          className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                        >
                          Notes <ChevronDown className={cn("size-3 transition-transform", showCustomerNotes && "rotate-180")} />
                        </button>
                      </div>
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
                          aria-pressed={paymentMethod === m.value}
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
                        <p className="text-[10px] text-muted-foreground">
                          Must total {formatCurrency(estimatedTotal, currency)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Discount */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Discount (optional)</Label>
                    <div className="flex gap-2">
                      <div className="flex overflow-hidden rounded-md border text-xs">
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
                          className="h-8 flex-1 text-sm"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Order Notes</Label>
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
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
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
              <Button variant="outline" onClick={() => handleClose()} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || cart.length === 0}>
                {submitting ? "Creating..." : "Create Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear the cart?"
        description={`This removes all ${totalQty} item(s) currently added. This can't be undone.`}
        confirmLabel="Clear cart"
        destructive
        onConfirm={handleClearCart}
      />

      {scannerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Scan barcode</p>
              <button onClick={closeScanner} aria-label="Close scanner" className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <div className="relative h-64 w-full bg-black">
              {scannerError ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white">{scannerError}</div>
              ) : (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
                  <div className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]" />
                </>
              )}
            </div>
            <div className="p-3">
              <Button variant="outline" className="w-full" onClick={closeScanner}>
                Close camera
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
