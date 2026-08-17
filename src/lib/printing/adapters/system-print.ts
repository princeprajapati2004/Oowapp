"use client";

// System/OS print adapter — the one connection type with no capability
// gate and no adapter object to hold open. It hands off to the browser's
// native print dialog, which already renders the correct bill via
// PrintOnlyBill/BillDocument (see components/printing/bill-document.tsx)
// and print:hidden/print:block CSS — the same mechanism useBillActions()
// already uses for the on-screen "Print" button. This function exists so
// printService (the printer-profile-aware orchestrator) has one call per
// connection type instead of special-casing SYSTEM inline.

/**
 * Opens the browser's native print dialog for whatever bill/receipt markup
 * is currently mounted on the page (print:block content). Resolves once
 * the dialog has been dismissed; the browser gives no signal for whether
 * the user actually completed or cancelled printing, so — same as the
 * existing Print button — this can only report that the dialog was shown,
 * not that paper came out.
 */
export function printViaSystemDialog(): void {
  window.print();
}
