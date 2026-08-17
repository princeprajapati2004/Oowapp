"use client";

// The Local Print Bridge's auth token is a secret for local-machine-to-
// local-machine authentication (browser <-> the bridge process running on
// the same computer) — it has no reason to ever leave this browser, so it
// lives in localStorage, not in the shop's Postgres row. Storing it
// server-side would needlessly expose a local secret to the cloud DB and
// every other device signed into the shop.

export interface BridgeCredentials {
  token: string;
  bridgeUrl?: string;
}

const KEY_PREFIX = "oowapp:bridge-credentials:";

export function getBridgeCredentials(printerId: string): BridgeCredentials | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY_PREFIX + printerId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === "string") return parsed as BridgeCredentials;
    return null;
  } catch {
    return null;
  }
}

export function setBridgeCredentials(printerId: string, creds: BridgeCredentials): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_PREFIX + printerId, JSON.stringify(creds));
}

export function clearBridgeCredentials(printerId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_PREFIX + printerId);
}
