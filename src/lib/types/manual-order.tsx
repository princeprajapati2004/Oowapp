// Shared shapes for the owner-facing manual order flow (create-order-page.tsx
// + add-items-panel.tsx). Kept separate so neither component has to import
// from the other just to share a type.

export type PaymentMethod = "CASH" | "UPI" | "CARD" | "ONLINE" | "WALLET" | "SPLIT" | "PENDING";

export interface Product {
  id: string;
  name: string;
  price: number;
  category: { id: string; name: string };
  isAvailable: boolean;
  isVisible: boolean;
  imageUrl?: string | null;
  foodType?: "VEG" | "NON_VEG" | "NA";
  stock?: number | null;
  barcode?: string | null;
  createdAt?: string;
}

// Carries a couple of display-only fields (imageUrl, categoryName) snapshotted
// at add-time so the order list can render without re-looking-up `products`
// (which may not have loaded yet, e.g. right after resuming a draft).
export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  categoryId: string;
  categoryName: string;
  imageUrl?: string | null;
}

export interface Tax {
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
export interface PastCustomer {
  customerName: string | null;
  customerPhone: string | null;
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
  { value: "WALLET", label: "Wallet" },
  { value: "SPLIT", label: "Split" },
  { value: "PENDING", label: "Pending" },
];

export const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const LOW_STOCK_THRESHOLD = 5;

// Wraps the substring of `text` that matches `query` in a <mark> — used for
// search-result highlighting. Returns a plain string when there's no match
// so callers can render it directly without an extra Fragment check.
export function highlightMatch(text: string, query: string): React.ReactNode {
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
export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
export type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
export type BarcodeDetectorCtor = new (options?: { formats: string[] }) => BarcodeDetectorLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}
