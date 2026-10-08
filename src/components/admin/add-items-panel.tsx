"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Search, X, Mic, ScanLine, Flame, Sparkles, AlertTriangle, ImageOff, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import {
  type Product,
  type CartItem,
  type ItemSettings,
  highlightMatch,
  NEW_BADGE_WINDOW_MS,
  LOW_STOCK_THRESHOLD,
  getSpeechRecognitionCtor,
  getBarcodeDetectorCtor,
  type SpeechRecognitionLike,
} from "@/lib/types/manual-order";

interface AddItemsPanelProps {
  currency: string;
  products: Product[];
  loadingProducts: boolean;
  // Timestamp captured when `products` was fetched (see create-order-page.tsx)
  // — used for the "New" badge instead of calling Date.now() during render,
  // which React's purity rules disallow.
  catalogLoadedAt: number;
  cart: CartItem[];
  popularProductIds: string[];
  recentlyViewedIds: string[];
  recentSearches: string[];
  onAddToCart: (product: Product) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onCommitSearch: (query: string) => void;
  onClose: () => void;
  showImages?: boolean;
  // "overlay" (default) is the existing full-screen modal opened via "Add
  // Items" on mobile/tablet. "inline" renders the same search/category/grid
  // content as a plain block, permanently docked in the desktop POS layout's
  // left pane (create-order-page.tsx) — no header/close/Done chrome, since
  // there's nothing to dismiss.
  variant?: "overlay" | "inline";
  // "list" (default) is the existing row layout. "grid" renders image-first
  // product cards for the desktop POS pane — same filtered data and handlers,
  // just different per-product markup.
  density?: "list" | "grid";
  // Item Master visibility toggles — gates the grid card's optional MRP/code
  // fields so only shop-enabled fields ever show (see ItemSettings).
  itemSettings?: ItemSettings | null;
}

function stockLabel(product: Product) {
  if (typeof product.stock !== "number") return null;
  if (product.stock <= 0) {
    return { text: "Out of stock", className: "border-red-300 text-red-600" };
  }
  if (product.stock <= LOW_STOCK_THRESHOLD) {
    return { text: `Low stock (${product.stock} left)`, className: "border-amber-300 text-amber-600" };
  }
  return { text: "In stock", className: "border-emerald-300 text-emerald-600" };
}

export function AddItemsPanel({
  currency,
  products,
  loadingProducts,
  catalogLoadedAt,
  cart,
  popularProductIds,
  recentlyViewedIds,
  recentSearches,
  onAddToCart,
  onUpdateQty,
  onCommitSearch,
  onClose,
  showImages = true,
  variant = "overlay",
  density = "list",
  itemSettings,
}: AddItemsPanelProps) {
  const isInline = variant === "inline";
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [voiceListening, setVoiceListening] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const voiceSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);
  const barcodeSupported = useMemo(
    () =>
      getBarcodeDetectorCtor() !== null &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    []
  );

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
    };
  }, []);

  // "/" focuses the search box (unless already typing somewhere), Escape
  // backs out of the barcode scanner sub-overlay — section 25's keyboard
  // support, scoped to this panel so it works identically whether it's the
  // mobile overlay or the desktop inline pane.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && scannerOpen) {
        closeScanner();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [scannerOpen]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.category.id, p.category.name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory = activeCategory === "all" || p.category.id === activeCategory;
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q;
      return matchesCategory && matchesSearch;
    });
  }, [products, search, activeCategory]);

  const selectedCount = cart.length;

  function productBadges(product: Product) {
    const isNew = product.createdAt && catalogLoadedAt - new Date(product.createdAt).getTime() < NEW_BADGE_WINDOW_MS;
    const rank = popularProductIds.indexOf(product.id);
    const isBestSeller = rank === 0;
    const isPopular = rank > 0 && rank < 5;
    const stock = stockLabel(product);

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
        {product.foodType === "EGG" && (
          <span className="flex size-3 items-center justify-center rounded-sm border border-amber-700 p-[1px]" title="Egg" aria-label="Egg">
            <span className="size-full rounded-[1px] bg-amber-700" />
          </span>
        )}
        {isBestSeller && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 px-1.5 py-0.5 text-[10px] text-amber-600">
            <Flame className="size-2.5" /> Best Seller
          </span>
        )}
        {isPopular && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-orange-300 px-1.5 py-0.5 text-[10px] text-orange-600">
            <Flame className="size-2.5" /> Popular
          </span>
        )}
        {isNew && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-300 px-1.5 py-0.5 text-[10px] text-blue-600">
            <Sparkles className="size-2.5" /> New
          </span>
        )}
        {stock && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]", stock.className)}>
            {stock.text !== "In stock" && <AlertTriangle className="size-2.5" />} {stock.text}
          </span>
        )}
      </div>
    );
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
        onCommitSearch(transcript);
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
          onCommitSearch(codes[0].rawValue);
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

  const showQuickPicks = !search.trim() && activeCategory === "all" && !loadingProducts && products.length > 0;
  const popularChips = popularProductIds.slice(0, 5);
  const recentChips = recentlyViewedIds.slice(0, 8);

  function quickPickChip(productId: string, key: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    return (
      <button
        key={key}
        onClick={() => onAddToCart(product)}
        className="shrink-0 rounded-full border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
      >
        {product.name}
      </button>
    );
  }

  return (
    <div className={isInline ? "flex h-full flex-col bg-background" : "fixed inset-0 z-50 flex flex-col bg-background"}>
      {/* Header — overlay only; the inline desktop pane has nothing to close */}
      {!isInline && (
        <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <button
            onClick={onClose}
            aria-label="Close item selection"
            className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Select &amp; Customize Products</h2>
            <p className="text-xs text-muted-foreground">
              {selectedCount > 0 ? `${selectedCount} item${selectedCount !== 1 ? "s" : ""} selected` : "Tap items to add them"}
            </p>
          </div>
          <Button size="sm" onClick={onClose} className="shrink-0">
            Done{selectedCount > 0 ? ` · ${selectedCount}` : ""}
          </Button>
        </header>
      )}

      {/* Search + filters */}
      <div className="shrink-0 space-y-2.5 border-b px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              aria-label="Search products"
              placeholder="Search products or scan barcode... (Press / to focus)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") onCommitSearch(search); }}
              className="h-10 pr-8 pl-8"
              autoFocus={!isInline}
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
                "flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-muted",
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
              className="flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-muted"
            >
              <ScanLine className="size-4" />
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              🔥 All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {showQuickPicks && (popularChips.length > 0 || recentChips.length > 0) && (
          <div className="mb-3 space-y-1.5">
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
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border p-2.5">
                <Skeleton className="size-14 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Search className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No products match &quot;{search}&quot;</p>
            <button onClick={() => { setSearch(""); setActiveCategory("all"); }} className="text-sm font-medium text-primary hover:underline">
              Clear filters
            </button>
          </div>
        ) : density === "grid" ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
            role="list"
            aria-label="Products"
          >
            {filtered.map((product) => {
              const inCart = cart.find((i) => i.productId === product.id);
              const mrpNum = product.mrp != null ? Number(product.mrp) : null;
              const showMrp =
                itemSettings?.mrpEnabled !== false && mrpNum != null && mrpNum > Number(product.price);
              const showCode = !!itemSettings?.productCodeEnabled && !!product.productCode;
              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  title={product.name}
                  onClick={() => onAddToCart(product)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onAddToCart(product);
                    }
                  }}
                  className="flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showImages && (
                    <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-muted">
                      {product.imageUrl ? (
                        <Image src={product.imageUrl} alt={product.name} fill sizes="200px" className="object-cover" unoptimized />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <ImageOff className="size-6 text-muted-foreground/40" />
                        </div>
                      )}
                      {inCart && (
                        <span className="absolute top-1.5 right-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground shadow">
                          {inCart.quantity}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">
                      {highlightMatch(product.name, search)}
                    </p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-semibold">{formatCurrency(Number(product.price), currency)}</span>
                      {showMrp && (
                        <span className="text-xs text-muted-foreground line-through">
                          {formatCurrency(mrpNum!, currency)}
                        </span>
                      )}
                    </div>
                    {showCode && <p className="truncate text-[10px] text-muted-foreground">#{product.productCode}</p>}
                    <div className="mt-0.5">{productBadges(product)}</div>

                    <div className="mt-auto pt-1.5" onClick={(e) => e.stopPropagation()}>
                      {inCart ? (
                        <div className="flex items-center justify-between gap-1.5 rounded-md border bg-muted/40 p-1">
                          <button
                            onClick={() => onUpdateQty(product.id, -1)}
                            aria-label={`Decrease quantity of ${product.name}`}
                            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-background active:scale-95"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="text-sm font-semibold tabular-nums">{inCart.quantity}</span>
                          <button
                            onClick={() => onUpdateQty(product.id, 1)}
                            aria-label={`Increase quantity of ${product.name}`}
                            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-background active:scale-95"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => onAddToCart(product)}
                          className="flex h-9 w-full items-center justify-center gap-1 rounded-md bg-primary/10 text-sm font-semibold text-primary transition-all hover:bg-primary/20 active:scale-95"
                        >
                          <Plus className="size-3.5" /> Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="Products">
            {filtered.map((product) => {
              const inCart = cart.find((i) => i.productId === product.id);
              return (
                <div
                  key={product.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
                >
                  {showImages && (
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {product.imageUrl ? (
                        <Image src={product.imageUrl} alt={product.name} fill sizes="56px" className="object-cover" unoptimized />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <ImageOff className="size-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{highlightMatch(product.name, search)}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatCurrency(Number(product.price), currency)}</span>
                      <span>·</span>
                      <span className="truncate">{product.category.name}</span>
                    </div>
                    <div className="mt-1">{productBadges(product)}</div>
                  </div>

                  {inCart ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => onUpdateQty(product.id, -1)}
                        aria-label={`Decrease quantity of ${product.name}`}
                        className="flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{inCart.quantity}</span>
                      <button
                        onClick={() => onUpdateQty(product.id, 1)}
                        aria-label={`Increase quantity of ${product.name}`}
                        className="flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onAddToCart(product)}
                      className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20 active:scale-95"
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

      {/* Selected-items summary — overlay only (section 6): running count +
          total so the Owner can see what's been added without leaving the
          product grid. The header's Done button (above) is the single
          confirm action — no second one duplicated here. */}
      {!isInline && selectedCount > 0 && (
        <div className="shrink-0 border-t bg-muted/30 px-4 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Selected Items · {selectedCount} item{selectedCount !== 1 ? "s" : ""}
            </span>
            <span className="font-semibold">
              {formatCurrency(cart.reduce((sum, i) => sum + i.price * i.quantity, 0), currency)}
            </span>
          </div>
        </div>
      )}

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
    </div>
  );
}
