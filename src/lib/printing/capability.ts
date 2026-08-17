"use client";

// Real, feature-detected capability checks — no guessing, no "probably
// supported". Every field here reflects what this exact browser/device
// actually exposes right now.

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:9743";

export type DeviceKind = "android" | "ios" | "windows" | "mac" | "linux" | "unknown";
export type BrowserKind = "chrome" | "edge" | "samsung" | "opera" | "firefox" | "safari" | "unknown";

export interface PrinterCapabilities {
  isSecureContext: boolean;
  device: DeviceKind;
  browser: BrowserKind;
  bluetooth: {
    apiPresent: boolean;
    // Whether requestDevice() can realistically be called — needs the API,
    // a secure context, and a Chromium-family browser (Web Bluetooth is not
    // implemented in Firefox or Safari as of this writing).
    usable: boolean;
    reason: string | null;
  };
  usb: {
    apiPresent: boolean;
    usable: boolean;
    reason: string | null;
  };
  systemPrint: {
    // window.print() — the one method with no capability gate at all.
    usable: true;
  };
}

function detectDevice(ua: string): DeviceKind {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/windows/i.test(ua)) return "windows";
  if (/mac os x/i.test(ua)) return "mac";
  if (/linux/i.test(ua)) return "linux";
  return "unknown";
}

function detectBrowser(ua: string): BrowserKind {
  if (/edg\//i.test(ua)) return "edge";
  if (/samsungbrowser/i.test(ua)) return "samsung";
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return "opera";
  if (/firefox/i.test(ua)) return "firefox";
  // Chrome check must come after Edge/Samsung/Opera — they all include "Chrome" in their UA string too.
  if (/chrome/i.test(ua)) return "chrome";
  if (/safari/i.test(ua)) return "safari";
  return "unknown";
}

const CHROMIUM_BROWSERS: BrowserKind[] = ["chrome", "edge", "samsung", "opera"];

export function getPrinterCapabilities(): PrinterCapabilities {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const device = detectDevice(ua);
  const browser = detectBrowser(ua);
  const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : false;

  const bluetoothApiPresent = typeof navigator !== "undefined" && "bluetooth" in navigator;
  let bluetoothReason: string | null = null;
  if (!bluetoothApiPresent) {
    bluetoothReason = CHROMIUM_BROWSERS.includes(browser)
      ? "Bluetooth printing is not available on this device."
      : "Bluetooth printing is not supported in this browser. Please use Chrome or Edge, or use Wi-Fi/USB printing.";
  } else if (!isSecureContext) {
    bluetoothReason = "Bluetooth printing requires a secure connection (HTTPS). Please use Wi-Fi/USB printing instead.";
  }

  const usbApiPresent = typeof navigator !== "undefined" && "usb" in navigator;
  let usbReason: string | null = null;
  if (!usbApiPresent) {
    usbReason = CHROMIUM_BROWSERS.includes(browser)
      ? "USB printing is not available on this device."
      : "USB printing is not supported in this browser. Please use Chrome or Edge, or use Wi-Fi/System printing.";
  } else if (!isSecureContext) {
    usbReason = "USB printing requires a secure connection (HTTPS). Please use Wi-Fi/System printing instead.";
  }

  return {
    isSecureContext,
    device,
    browser,
    bluetooth: {
      apiPresent: bluetoothApiPresent,
      usable: bluetoothApiPresent && isSecureContext,
      reason: bluetoothReason,
    },
    usb: {
      apiPresent: usbApiPresent,
      usable: usbApiPresent && isSecureContext,
      reason: usbReason,
    },
    systemPrint: { usable: true },
  };
}

/**
 * Real reachability check for the optional local print bridge — a plain
 * fetch with a short timeout, not a guess. Resolves false on any network
 * error, non-OK response, or timeout; never throws.
 */
export async function checkBridgeReachable(bridgeUrl: string = DEFAULT_BRIDGE_URL, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${bridgeUrl}/health`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
