// Device-local order history — there's no customer login, so "past orders"
// means "orders placed from this browser," remembered per shop the same way
// the cart already is (see use-cart.ts). Never sent to the server.

export interface StoredOrderRef {
  orderId: string;
  billNumber: string;
  placedAt: string;
}

const MAX_STORED = 50;

function storageKey(slug: string) {
  return `oowapp_order_history_${slug}`;
}

export function getStoredOrders(slug: string): StoredOrderRef[] {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addStoredOrder(slug: string, ref: StoredOrderRef) {
  try {
    const existing = getStoredOrders(slug);
    if (existing.some((o) => o.orderId === ref.orderId)) return;
    localStorage.setItem(storageKey(slug), JSON.stringify([ref, ...existing].slice(0, MAX_STORED)));
  } catch {
    // Private browsing / quota exceeded — non-critical, skip silently.
  }
}
