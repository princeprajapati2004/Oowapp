"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBarcodeDetectorCtor } from "@/lib/types/manual-order";

// Standalone camera-scan modal for filling a single barcode value — a
// scaled-down copy of add-items-panel.tsx's scanner (getUserMedia +
// BarcodeDetector detect loop), kept separate rather than shared so this
// form-field use case can't regress the already-working order-taking
// scanner, and vice versa.
export function BarcodeScanButton({ onDetect }: { onDetect: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const supported = useMemo(
    () =>
      getBarcodeDetectorCtor() !== null &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    []
  );

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function openScanner() {
    setError(null);
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      runDetectLoop();
    } catch {
      setError("Camera access denied or unavailable.");
    }
  }

  function closeScanner() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
  }

  function runDetectLoop() {
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"] });
    const tick = async () => {
      if (!streamRef.current || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          onDetect(codes[0].rawValue);
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

  if (!supported) return null;

  return (
    <>
      <Button type="button" variant="outline" size="icon" onClick={openScanner} aria-label="Scan barcode" title="Scan barcode">
        <ScanLine className="size-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Scan barcode</p>
              <button onClick={closeScanner} aria-label="Close scanner" className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <div className="relative h-64 w-full bg-black">
              {error ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white">{error}</div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
                  <div className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]" />
                </>
              )}
            </div>
            <div className="p-3">
              <Button type="button" variant="outline" className="w-full" onClick={closeScanner}>
                Close camera
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
