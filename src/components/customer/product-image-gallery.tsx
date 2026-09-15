"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Swipe threshold in px — deliberately generous so a scroll/tap on the
// backdrop doesn't get misread as a swipe.
const SWIPE_THRESHOLD = 40;

/**
 * Full-size image viewer for a product's gallery — main image, thumbnail
 * strip, prev/next controls, swipe-on-mobile, and keyboard arrows. Used from
 * ProductCard when a product has one or more images; a single-image product
 * still gets this as a "tap to zoom" view.
 */
export function ProductImageGallery({
  images,
  productName,
  open,
  onOpenChange,
  initialIndex = 0,
}: {
  images: string[];
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialIndex?: number;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex(initialIndex);
    }
  }, [open, initialIndex]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
    setBroken(false);
  }, [index, open]);

  if (images.length === 0) return null;

  function goTo(next: number) {
    setIndex((next + images.length) % images.length);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") goTo(index - 1);
    if (e.key === "ArrowRight") goTo(index + 1);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const deltaX = e.changedTouches[0]!.clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
    goTo(deltaX > 0 ? index - 1 : index + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg p-3 sm:p-4"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">
          {productName} — photo {index + 1} of {images.length}
        </DialogTitle>

        <div
          className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {broken ? (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="size-8" />
              <p className="text-xs">Image couldn&apos;t be loaded</p>
            </div>
          ) : (
            <>
              <Image
                key={images[index]}
                src={images[index]!}
                alt={`${productName} — photo ${index + 1} of ${images.length}`}
                fill
                className={cn("object-contain transition-opacity", loaded ? "opacity-100" : "opacity-0")}
                unoptimized
                onLoad={() => setLoaded(true)}
                onError={() => setBroken(true)}
              />
              {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}

          {images.length > 1 && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full opacity-90"
                onClick={() => goTo(index - 1)}
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full opacity-90"
                onClick={() => goTo(index + 1)}
                aria-label="Next photo"
              >
                <ChevronRight className="size-4" />
              </Button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium tabular-nums">
                {index + 1} / {images.length}
              </span>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`View photo ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "relative size-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                  i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                )}
              >
                <Image src={url} alt="" fill className="object-cover" unoptimized />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
