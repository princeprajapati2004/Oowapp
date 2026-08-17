"use client";

// Client for the Local Print Bridge (bridge/server.mjs) — the transport
// Wi-Fi ("network") printers use, since browsers cannot open a raw TCP
// socket to a printer on port 9100 themselves. Every call here is a real
// fetch to a real local process; if that process isn't running, this
// reports exactly that rather than pretending the printer connected.

import { checkBridgeReachable, DEFAULT_BRIDGE_URL } from "../capability";
import { PrinterAdapterError, type ConnectedPrinterHandle } from "./types";

export interface BridgePrinterTarget {
  id: string;
  ip: string;
  port: number;
  token: string;
  bridgeUrl?: string;
}

interface BridgeResponse {
  ok: boolean;
  error?: string;
  status?: string;
  printers?: { id: string; status: string }[];
  bytesWritten?: number;
}

async function bridgeFetch(bridgeUrl: string, path: string, token: string, init?: RequestInit): Promise<BridgeResponse> {
  let res: Response;
  try {
    res = await fetch(`${bridgeUrl}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new PrinterAdapterError(
      "CONNECTION_FAILED",
      `Could not reach the Local Print Bridge at ${bridgeUrl}. Make sure it is running ("npm run bridge") on this computer.`
    );
  }

  if (res.status === 401) {
    throw new PrinterAdapterError(
      "PERMISSION_DENIED",
      "The Local Print Bridge rejected the request — its token doesn't match. Update the bridge token in Printer Settings."
    );
  }

  let body: BridgeResponse | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body?.ok) {
    throw new PrinterAdapterError("CONNECTION_FAILED", body?.error || `Local Print Bridge returned an error (HTTP ${res.status}).`);
  }
  return body;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Connects to a Wi-Fi printer via the Local Print Bridge's real TCP relay. */
export async function connectBridgePrinter(target: BridgePrinterTarget): Promise<ConnectedPrinterHandle> {
  const bridgeUrl = target.bridgeUrl ?? DEFAULT_BRIDGE_URL;

  const reachable = await checkBridgeReachable(bridgeUrl);
  if (!reachable) {
    throw new PrinterAdapterError(
      "NOT_SUPPORTED",
      `The Local Print Bridge is not running or not reachable at ${bridgeUrl}. Install and start it on this computer, then try again.`
    );
  }

  const connectResult = await bridgeFetch(bridgeUrl, "/printers/connect", target.token, {
    method: "POST",
    body: JSON.stringify({ id: target.id, ip: target.ip, port: target.port }),
  });

  if (!connectResult.ok) {
    throw new PrinterAdapterError("CONNECTION_FAILED", connectResult.error || `Could not connect to the printer at ${target.ip}:${target.port}.`);
  }

  let disconnectListeners: (() => void)[] = [];

  // The bridge holds the real socket; a plain HTTP bridge has no push
  // channel back to the page, so an unrequested drop is only detectable by
  // polling status — an honest, if imperfect, substitute for a live event.
  const pollTimer: ReturnType<typeof setInterval> = setInterval(() => {
    void (async () => {
      try {
        const list = await bridgeFetch(bridgeUrl, "/printers", target.token, { method: "GET" });
        const entry = (list.printers ?? []).find((p) => p.id === target.id);
        if (!entry || entry.status !== "CONNECTED") {
          disconnectListeners.forEach((cb) => cb());
        }
      } catch {
        disconnectListeners.forEach((cb) => cb());
      }
    })();
  }, 5000);

  return {
    label: `${target.ip}:${target.port} (via Local Print Bridge)`,
    identity: { ipAddress: target.ip, port: target.port },
    async write(bytes: Uint8Array) {
      const result = await bridgeFetch(bridgeUrl, `/printers/${encodeURIComponent(target.id)}/print`, target.token, {
        method: "POST",
        body: JSON.stringify({ dataBase64: toBase64(bytes) }),
      });
      if (!result.ok) {
        throw new PrinterAdapterError("WRITE_FAILED", result.error || "The Local Print Bridge failed to send data to the printer.");
      }
    },
    async disconnect() {
      clearInterval(pollTimer);
      disconnectListeners = [];
      try {
        await bridgeFetch(bridgeUrl, `/printers/${encodeURIComponent(target.id)}/disconnect`, target.token, { method: "POST" });
      } catch {
        // best-effort — bridge may already be down
      }
    },
    onUnexpectedDisconnect(cb: () => void) {
      disconnectListeners.push(cb);
      return () => {
        disconnectListeners = disconnectListeners.filter((l) => l !== cb);
      };
    },
  };
}
