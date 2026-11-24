"use client";

// Hands ESC/POS bytes to the RawBT Android app (ru.a402d.rawbtprinter,
// https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter)
// instead of talking to the printer directly. This exists because Web
// Bluetooth (adapters/bluetooth.ts) can only reach BLE/GATT devices — a
// browser tab has no API for Classic Bluetooth/SPP at all, on any platform.
// RawBT sidesteps that by being a native Android app with real OS-level
// Bluetooth access, and it registers itself as the handler for a `rawbt:`
// URL scheme — any page can hand off print data the same way a `mailto:`
// or `tel:` link hands off to another app, no pairing dialog, no GATT
// service, no Web Bluetooth involved.
//
// Verified against the RawBT author's (402d) own demo front-end
// (github.com/402d/rawbt_ws_server), which uses this exact
// `rawbt:base64,<data>` form via `window.location.href` on Android.
// Like window.print() (system-print.ts), this is a fire-and-forget
// hand-off — the browser gives no signal for whether RawBT is even
// installed or whether the printer actually produced paper.

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Hands off already-rendered ESC/POS bytes to the RawBT app via its `rawbt:` intent URL scheme. Android + RawBT installed only. */
export function printViaRawbt(bytes: Uint8Array): void {
  window.location.href = `rawbt:base64,${toBase64(bytes)}`;
}
