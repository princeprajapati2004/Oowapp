"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Minus, Plus, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import {
  type Product,
  type CartItem,
  getBarcodeDetectorCtor,
  LOW_STOCK_THRESHOLD,
} from "@/lib/types/manual-order";

// Self-contained camera/detect-loop implementation — deliberately not shared
// with add-items-panel.tsx's or barcode-scan-button.tsx's scanners (same
// precedent as barcode-scan-button.tsx: kept independent so this auto-add
// flow can't regress the already-working ones, and vice versa). The one
// structural difference from those two is that a hit here pauses the loop
// for a cooldown instead of tearing the camera down — see the comment above
// runDetectLoop below.

type CameraStatus = "starting" | "scanning" | "paused" | "error";

interface ScanItemsPanelProps {
  currency: string;
  products: Product[];
  onAddToCart: (product: Product) => void;
  onClose: () => void;
}

function lowStockWarning(product: Product): string | null {
  if (typeof product.stock !== "number") return null;
  if (product.stock <= 0) return "Out of stock";
  if (product.stock <= LOW_STOCK_THRESHOLD) return `Only ${product.stock} left`;
  return null;
}

export function ScanItemsPanel({ currency, products, onAddToCart, onClose }: ScanItemsPanelProps) {
  const [scannedCart, setScannedCart] = useState<CartItem[]>([]);
  const [manualBarcode, setManualBarcode] = useState("");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(() =>
    getBarcodeDetectorCtor() !== null && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
      ? "starting"
      : "error"
  );
  const [scannerError, setScannerError] = useState<string | null>(() =>
    getBarcodeDetectorCtor() !== null && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
      ? null
      : "Camera scanning isn't supported on this browser. Use manual entry below."
  );
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(false);
  const scannedCartRef = useRef<CartItem[]>([]);
  const productsRef = useRef(products);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  const cameraSupported = useMemo(
    () =>
      getBarcodeDetectorCtor() !== null &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    []
  );

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  function mutateScannedCart(updater: (prev: CartItem[]) => CartItem[]) {
    const next = updater(scannedCartRef.current);
    scannedCartRef.current = next;
    setScannedCart(next);
  }

  function playBeep() {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioCtxRef.current ?? new Ctor();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // never block scanning on audio failure
    }
  }

  function startCooldown(productName: string) {
    if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
    isPausedRef.current = true;
    setCameraStatus("paused");
    setLastAddedName(productName);
    cooldownTimeoutRef.current = setTimeout(() => {
      isPausedRef.current = false;
      setCameraStatus("scanning");
      setLastAddedName(null);
      cooldownTimeoutRef.current = null;
    }, 3000);
  }

  function addScannedProduct(product: Product) {
    const currentQty = scannedCartRef.current.find((i) => i.productId === product.id)?.quantity ?? 0;
    if (typeof product.stock === "number" && currentQty + 1 > product.stock) {
      toast.error(
        product.stock <= 0 ? `${product.name} is out of stock.` : `Only ${product.stock} unit(s) of ${product.name} available.`
      );
      return;
    }
    mutateScannedCart((prev) => {
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
    playBeep();
    startCooldown(product.name);
  }

  function processBarcode(raw: string) {
    const code = raw.trim().toLowerCase();
    if (!code) return;
    const product = productsRef.current.find((p) => p.barcode?.toLowerCase() === code);
    if (!product) {
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
      isPausedRef.current = true;
      setCameraStatus("paused");
      setNotFoundBarcode(raw.trim());
      return;
    }
    addScannedProduct(product);
  }

  function submitManualBarcode() {
    if (!manualBarcode.trim()) return;
    processBarcode(manualBarcode);
    setManualBarcode("");
  }

  function resumeScanning(focusManual: boolean) {
    setNotFoundBarcode(null);
    isPausedRef.current = false;
    setCameraStatus("scanning");
    if (focusManual) manualInputRef.current?.focus();
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  // Unlike add-items-panel.tsx's scanner (which tears the camera down on
  // every hit), a match here only pauses detection via isPausedRef — the
  // stream and rAF loop stay alive through the cooldown so resuming is
  // instant and the preview never flickers/reconnects.
  function runDetectLoop() {
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"] });
    const tick = async () => {
      if (!streamRef.current || !videoRef.current) return;
      if (!isPausedRef.current) {
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) processBarcode(codes[0].rawValue);
        } catch {
          // transient decode failure on this frame — keep trying
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (!cameraSupported) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraStatus("scanning");
        runDetectLoop();
      } catch {
        if (!cancelled) {
          setCameraStatus("error");
          setScannerError("Camera access is unavailable. Please allow camera permission or enter the barcode manually.");
        }
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function incrementScannedQty(productId: string) {
    const product = productsRef.current.find((p) => p.id === productId);
    const current = scannedCartRef.current.find((i) => i.productId === productId)?.quantity ?? 0;
    if (product && typeof product.stock === "number" && current + 1 > product.stock) {
      toast.error(`Only ${product.stock} unit(s) available.`);
      return;
    }
    mutateScannedCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i)));
  }

  function decrementScannedQty(productId: string) {
    mutateScannedCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i)).filter((i) => i.quantity > 0)
    );
  }

  function handleCancelClick() {
    if (scannedCartRef.current.length > 0) setShowCancelConfirm(true);
    else onClose();
  }

  function handleAddAndClose() {
    scannedCart.forEach((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return;
      for (let i = 0; i < item.quantity; i++) onAddToCart(product);
    });
    onClose();
  }

  const totalQty = scannedCart.reduce((s, i) => s + i.quantity, 0);
  const subtotal = scannedCart.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <button
          onClick={handleCancelClick}
          aria-label="Back"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Select Items via Scan</h2>
          <p className="text-xs text-muted-foreground">Scan barcodes to auto-add items</p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Camera className="size-4" />
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Camera preview */}
        <div className="relative h-72 w-full overflow-hidden rounded-2xl border bg-black">
          {cameraStatus === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/90">
              <Camera className="size-6 text-white/50" />
              {scannerError}
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
              {cameraStatus === "scanning" && (
                <div className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]" />
              )}
              <Badge
                variant="outline"
                className={cn(
                  "absolute top-3 left-3 border-none",
                  cameraStatus === "scanning" && "bg-emerald-600/90 text-white",
                  cameraStatus === "paused" && "bg-amber-500/90 text-white",
                  cameraStatus === "starting" && "bg-black/60 text-white"
                )}
              >
                {cameraStatus === "starting" && "Starting camera..."}
                {cameraStatus === "scanning" && "Scanning active..."}
                {cameraStatus === "paused" && lastAddedName && `Added! Change product (3s)...`}
                {cameraStatus === "paused" && !lastAddedName && !notFoundBarcode && "Paused"}
              </Badge>
            </>
          )}

          {notFoundBarcode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
              <p className="text-sm font-medium text-white">Product not found</p>
              <p className="max-w-full truncate text-xs text-white/60">Barcode: {notFoundBarcode}</p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => resumeScanning(false)}>
                  Scan Again
                </Button>
                <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => resumeScanning(true)}>
                  Enter Barcode
                </Button>
                <a href="/admin/products" target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-400 hover:underline">
                  Add Product ↗
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Manual barcode entry */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <ScanLine className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={manualInputRef}
              aria-label="Enter barcode manually"
              placeholder="Or type barcode & press Enter..."
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitManualBarcode();
              }}
              className="h-10 pr-8 pl-8"
            />
            {manualBarcode && (
              <button
                onClick={() => setManualBarcode("")}
                aria-label="Clear barcode input"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button variant="outline" onClick={submitManualBarcode} disabled={!manualBarcode.trim()}>
            Add
          </Button>
        </div>

        {/* Scanned items cart */}
        <div className="space-y-2.5 rounded-2xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold">Scanned Items Cart</span>
            <Badge variant="secondary">{totalQty} item{totalQty !== 1 ? "s" : ""}</Badge>
          </div>

          {scannedCart.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Scanned items will appear here</p>
          ) : (
            <div className="space-y-2">
              {scannedCart.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                const warning = product ? lowStockWarning(product) : null;
                return (
                  <div key={item.productId} className="flex items-center gap-3 rounded-xl border p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.price, currency)} × {item.quantity}
                        {warning && <span className="ml-1.5 text-amber-600">· {warning}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => decrementScannedQty(item.productId)}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                      <button
                        onClick={() => incrementScannedQty(item.productId)}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted active:scale-95"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(item.price * item.quantity, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 border-t bg-background/98 px-5 py-3 backdrop-blur-sm"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="text-sm">
          {scannedCart.length > 0 ? (
            <>
              <span className="font-medium">{totalQty} items</span>
              <span className="text-muted-foreground"> · {formatCurrency(subtotal, currency)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No items scanned</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancelClick}>
            Cancel
          </Button>
          <Button onClick={handleAddAndClose} disabled={scannedCart.length === 0}>
            Add{scannedCart.length > 0 ? ` · ${totalQty}` : ""}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Discard scanned items?"
        description={`This discards ${totalQty} scanned item(s) that haven't been added to the order yet.`}
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setShowCancelConfirm(false);
          onClose();
        }}
      />
    </div>
  );
}
