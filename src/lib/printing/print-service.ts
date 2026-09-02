"use client";

// Orchestrates a print request end to end: resolve which real printer to
// use, record a PrintJob row for the queue/audit trail, dispatch to the
// matching adapter (Bluetooth/USB/Wi-Fi bridge/system dialog), and report
// back exactly what happened. This is the only place in the app that
// should decide "which printer, which transport" — order-detail pages and
// the Printer Settings page both call into this rather than talking to
// adapters directly.

import { buildReceiptLines, buildTestPrintLines, THERMAL_CHAR_WIDTH } from "./receipt-lines";
import { renderEscPosReceipt } from "./escpos";
import { connectBluetoothPrinter, reconnectBluetoothPrinter } from "./adapters/bluetooth";
import { connectUsbPrinter, reconnectUsbPrinter } from "./adapters/usb";
import { connectBridgePrinter } from "./adapters/bridge";
import { printViaSystemDialog } from "./adapters/system-print";
import { getBridgeCredentials } from "./bridge-token-store";
import { PrinterAdapterError, type ConnectedPrinterHandle } from "./adapters/types";
import { api } from "@/lib/api-client";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";
import type { PrintFormat } from "@/lib/types/print";

export type PrinterConnectionType = "BLUETOOTH" | "WIFI" | "USB" | "SYSTEM";

export interface PrinterProfileDTO {
  id: string;
  name: string;
  connectionType: PrinterConnectionType;
  paperSize: PrintFormat;
  purpose: string | null;
  isDefault: boolean;
  isActive: boolean;
  ipAddress: string | null;
  port: number | null;
  protocol: string | null;
  bluetoothDeviceId: string | null;
  bluetoothDeviceName: string | null;
  usbVendorId: number | null;
  usbProductId: number | null;
  // Local Print Agent — when agentId is set, this printer is reached
  // through a registered agent on the owner's PC, never directly by the
  // browser (see print-agent/). systemPrinterName is the exact
  // Windows-installed printer name the agent prints to.
  agentId: string | null;
  systemPrinterName: string | null;
  status: string;
  statusMessage: string | null;
  lastConnectedAt: string | null;
  lastTestAt: string | null;
  lastTestSuccess: boolean | null;
}

export interface PrintOutcome {
  ok: boolean;
  printer: PrinterProfileDTO | null;
  error?: string;
  errorCode?: string;
  jobId?: string;
  // True when a Local Print Agent will finish the job asynchronously — the
  // browser never touched the printer, so "ok" here only means "queued
  // successfully," not "printed." Callers should point the owner at the
  // print queue (Printer Settings) for the real outcome.
  queued?: boolean;
}

export async function fetchPrinters(): Promise<PrinterProfileDTO[]> {
  return api.get<PrinterProfileDTO[]>("/api/admin/printers");
}

export function pickDefaultPrinter(printers: PrinterProfileDTO[]): PrinterProfileDTO | null {
  return printers.find((p) => p.isDefault && p.isActive) ?? printers.find((p) => p.isActive) ?? null;
}

async function createJob(args: {
  printerId: string | null;
  documentType: "BILL" | "KITCHEN_TICKET" | "TEST";
  orderId: string | null;
  format: PrintFormat;
}): Promise<{ id: string } | null> {
  try {
    return await api.post<{ id: string }>("/api/admin/print-jobs", args);
  } catch {
    return null;
  }
}

async function patchJob(id: string, data: { status: string; errorMessage?: string | null }): Promise<void> {
  try {
    await api.patch(`/api/admin/print-jobs/${id}`, data);
  } catch {
    // best-effort bookkeeping — never block the print flow on this
  }
}

async function patchPrinterStatus(id: string, data: Record<string, unknown>): Promise<void> {
  try {
    await api.patch(`/api/admin/printers/${id}`, data);
  } catch {
    // best-effort — a failed status write shouldn't fail the print
  }
}

function charWidthFor(paperSize: PrintFormat): "58" | "80" {
  return paperSize === "THERMAL_58" ? "58" : "80";
}

async function connectForPrinter(printer: PrinterProfileDTO): Promise<ConnectedPrinterHandle> {
  switch (printer.connectionType) {
    case "BLUETOOTH": {
      if (!printer.bluetoothDeviceId) {
        throw new PrinterAdapterError("NO_SELECTION", "This printer has no paired Bluetooth device. Reconnect it from Printer Settings.");
      }
      return reconnectBluetoothPrinter(printer.bluetoothDeviceId);
    }
    case "USB": {
      if (printer.usbVendorId == null || printer.usbProductId == null) {
        throw new PrinterAdapterError("NO_SELECTION", "This printer has no authorized USB device. Reconnect it from Printer Settings.");
      }
      return reconnectUsbPrinter(printer.usbVendorId, printer.usbProductId);
    }
    case "WIFI": {
      if (!printer.ipAddress || !printer.port) {
        throw new PrinterAdapterError("CONNECTION_FAILED", "This printer has no IP address configured.");
      }
      const creds = getBridgeCredentials(printer.id);
      if (!creds?.token) {
        throw new PrinterAdapterError("NOT_SUPPORTED", "No Local Print Bridge token is set for this printer. Add it in Printer Settings.");
      }
      return connectBridgePrinter({ id: printer.id, ip: printer.ipAddress, port: printer.port, token: creds.token, bridgeUrl: creds.bridgeUrl });
    }
    default:
      throw new PrinterAdapterError("NOT_SUPPORTED", "System printers don't use a device connection.");
  }
}

async function sendBillReceipt(handle: ConnectedPrinterHandle, order: BillOrderData, shop: BillShopData, paperSize: PrintFormat): Promise<void> {
  const width = charWidthFor(paperSize);
  const lines = buildReceiptLines(order, shop, width);
  const bytes = renderEscPosReceipt(lines, THERMAL_CHAR_WIDTH[width]);
  await handle.write(bytes);
}

/** Also used by the Add Printer wizard's connectivity check, before a PrinterProfile row exists to attach job bookkeeping to. */
export async function sendTestReceipt(
  handle: ConnectedPrinterHandle,
  args: { businessName: string; printerName: string; connectionLabel: string; paperSize: PrintFormat }
): Promise<void> {
  const width = charWidthFor(args.paperSize);
  const lines = buildTestPrintLines({
    businessName: args.businessName,
    printerName: args.printerName,
    connectionLabel: args.connectionLabel,
    paperLabel: args.paperSize,
  });
  const bytes = renderEscPosReceipt(lines, THERMAL_CHAR_WIDTH[width]);
  await handle.write(bytes);
}

/**
 * Prints a bill through the shop's configured printer system: resolves the
 * requested (or default) PrinterProfile, records a PrintJob for the queue,
 * and dispatches to the matching real adapter. Falls back to the existing
 * browser print dialog when no printer is configured (or the resolved
 * printer is a SYSTEM one) — printing keeps working exactly as it did
 * before this system existed.
 */
export async function printBill(order: BillOrderData, shop: BillShopData, opts?: { printerId?: string }): Promise<PrintOutcome> {
  let printers: PrinterProfileDTO[] = [];
  try {
    printers = await fetchPrinters();
  } catch {
    // couldn't load printer profiles — fall back to system print rather than blocking the user from printing at all
  }

  const printer = opts?.printerId ? printers.find((p) => p.id === opts.printerId) ?? null : pickDefaultPrinter(printers);
  const format = printer?.paperSize ?? shop.printFormat;
  const job = await createJob({ printerId: printer?.id ?? null, documentType: "BILL", orderId: order.id, format });

  if (!printer || printer.connectionType === "SYSTEM") {
    printViaSystemDialog();
    if (job) await patchJob(job.id, { status: "COMPLETED" });
    return { ok: true, printer, jobId: job?.id };
  }

  if (printer.agentId) {
    // The backend already rendered the receipt and queued it for the agent
    // (see createPrintJob/print-payload.ts) — the browser's job here is
    // done; the print queue in Printer Settings shows the real outcome.
    return { ok: true, printer, jobId: job?.id, queued: true };
  }

  if (job) await patchJob(job.id, { status: "PRINTING" });

  try {
    const handle = await connectForPrinter(printer);
    try {
      await sendBillReceipt(handle, order, shop, printer.paperSize);
    } finally {
      await handle.disconnect().catch(() => {});
    }
    if (job) await patchJob(job.id, { status: "COMPLETED" });
    await patchPrinterStatus(printer.id, { status: "CONNECTED", statusMessage: null, lastConnectedAt: new Date().toISOString() });
    return { ok: true, printer, jobId: job?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Print failed";
    const code = err instanceof PrinterAdapterError ? err.code : undefined;
    if (job) await patchJob(job.id, { status: "FAILED", errorMessage: message });
    await patchPrinterStatus(printer.id, { status: "ERROR", statusMessage: message });
    return { ok: false, printer, error: message, errorCode: code, jobId: job?.id };
  }
}

/** Sends a small connectivity test receipt to an already-saved printer — the "Test Print" button in Printer Settings. Never a real bill. */
export async function testPrintPrinter(printer: PrinterProfileDTO, businessName: string): Promise<PrintOutcome> {
  const job = await createJob({ printerId: printer.id, documentType: "TEST", orderId: null, format: printer.paperSize });

  if (printer.agentId) {
    return { ok: true, printer, jobId: job?.id, queued: true };
  }

  if (job) await patchJob(job.id, { status: "PRINTING" });

  if (printer.connectionType === "SYSTEM") {
    printViaSystemDialog();
    if (job) await patchJob(job.id, { status: "COMPLETED" });
    return { ok: true, printer, jobId: job?.id };
  }

  try {
    const handle = await connectForPrinter(printer);
    try {
      await sendTestReceipt(handle, {
        businessName,
        printerName: printer.name,
        connectionLabel: printer.connectionType,
        paperSize: printer.paperSize,
      });
    } finally {
      await handle.disconnect().catch(() => {});
    }
    if (job) await patchJob(job.id, { status: "COMPLETED" });
    await patchPrinterStatus(printer.id, {
      status: "CONNECTED",
      statusMessage: null,
      lastConnectedAt: new Date().toISOString(),
      lastTestAt: new Date().toISOString(),
      lastTestSuccess: true,
    });
    return { ok: true, printer, jobId: job?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test print failed";
    const code = err instanceof PrinterAdapterError ? err.code : undefined;
    if (job) await patchJob(job.id, { status: "FAILED", errorMessage: message });
    await patchPrinterStatus(printer.id, {
      status: "ERROR",
      statusMessage: message,
      lastTestAt: new Date().toISOString(),
      lastTestSuccess: false,
    });
    return { ok: false, printer, error: message, errorCode: code, jobId: job?.id };
  }
}

/**
 * Opens the native device chooser (Bluetooth/USB) or checks the Local
 * Print Bridge (Wi-Fi) and connects for real — used by the Add Printer
 * wizard before any PrinterProfile row exists. The caller is responsible
 * for sending a test receipt over the returned handle and disconnecting
 * it once the wizard is done with it. Must be called from a user gesture
 * for Bluetooth/USB (the browser enforces this).
 */
export async function connectNewPrinter(
  connectionType: "BLUETOOTH" | "USB" | "WIFI",
  wifiTarget?: { ip: string; port: number; token: string; bridgeUrl?: string }
): Promise<{ handle: ConnectedPrinterHandle; identity: Record<string, string | number> }> {
  let handle: ConnectedPrinterHandle;
  if (connectionType === "BLUETOOTH") {
    handle = await connectBluetoothPrinter();
  } else if (connectionType === "USB") {
    handle = await connectUsbPrinter();
  } else {
    if (!wifiTarget) throw new PrinterAdapterError("CONNECTION_FAILED", "IP address and port are required.");
    handle = await connectBridgePrinter({ id: `pending-${Date.now()}`, ...wifiTarget });
  }
  return { handle, identity: handle.identity ?? {} };
}

export { PrinterAdapterError };
export type { ConnectedPrinterHandle };
