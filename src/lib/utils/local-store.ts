// Small per-shop client-side persistence helper for browser-only UX state
// (favorites, recent searches, draft orders, customer notes) that isn't
// worth a database round-trip or a schema change. Namespaced by shopSlug so
// multiple shops on the same browser never collide.
const PREFIX = "oowapp";

function buildKey(shopSlug: string, key: string) {
  return `${PREFIX}:${shopSlug}:${key}`;
}

export function readLocalStore<T>(shopSlug: string, key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(buildKey(shopSlug, key));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStore<T>(shopSlug: string, key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildKey(shopSlug, key), JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private browsing) — silently skip, this
    // is a convenience feature, never load-bearing.
  }
}

export function clearLocalStore(shopSlug: string, key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildKey(shopSlug, key));
  } catch {
    // ignore
  }
}
