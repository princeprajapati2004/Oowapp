"use client";

// Real WebUSB printer adapter. Talks to navigator.usb directly — no
// simulated device list, no fake transfer results. USB thermal printers
// almost universally expose a bulk OUT endpoint that raw ESC/POS bytes can
// be written to directly (unlike Bluetooth, there's no vendor-UUID
// guessing game here — the device's own USBConfiguration describes its
// endpoints, and the browser's driver handles packetization).

import { getPrinterCapabilities } from "../capability";
import { PrinterAdapterError, type ConnectedPrinterHandle } from "./types";

function mapUsbError(err: unknown): PrinterAdapterError {
  const name = err instanceof DOMException ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "NotFoundError") {
    return new PrinterAdapterError("NO_SELECTION", "No USB printer was selected, or none was found. Make sure it's plugged in and powered on.");
  }
  if (name === "SecurityError" || name === "NotAllowedError") {
    return new PrinterAdapterError("PERMISSION_DENIED", "USB permission was denied. Allow USB access for this site and try again.");
  }
  if (name === "NetworkError" || name === "InvalidStateError") {
    return new PrinterAdapterError(
      "CONNECTION_FAILED",
      "Could not open the USB printer. It may be in use by another application (such as a printer driver) — close it and try again."
    );
  }
  return new PrinterAdapterError("CONNECTION_FAILED", `USB connection failed: ${message}`);
}

function assertUsbUsable(): void {
  const caps = getPrinterCapabilities();
  if (!caps.usb.apiPresent) {
    throw new PrinterAdapterError("NOT_SUPPORTED", caps.usb.reason ?? "USB printing is not supported on this device/browser.");
  }
  if (!caps.isSecureContext) {
    throw new PrinterAdapterError("INSECURE_CONTEXT", caps.usb.reason ?? "USB printing requires a secure (HTTPS) connection.");
  }
}

interface BulkOutTarget {
  interfaceNumber: number;
  endpointNumber: number;
}

function findBulkOutEndpoint(device: USBDevice): BulkOutTarget | null {
  const config = device.configuration;
  if (!config) return null;
  for (const iface of config.interfaces) {
    const endpoint = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
    if (endpoint) return { interfaceNumber: iface.interfaceNumber, endpointNumber: endpoint.endpointNumber };
  }
  return null;
}

async function connectToDevice(device: USBDevice): Promise<ConnectedPrinterHandle> {
  try {
    await device.open();
    if (!device.configuration) {
      const first = device.configurations[0];
      if (!first) {
        throw new PrinterAdapterError("CONNECTION_FAILED", "This USB device does not expose any configuration and cannot be used for printing.");
      }
      await device.selectConfiguration(first.configurationValue);
    }
  } catch (err) {
    if (err instanceof PrinterAdapterError) throw err;
    throw mapUsbError(err);
  }

  const target = findBulkOutEndpoint(device);
  if (!target) {
    await device.close();
    throw new PrinterAdapterError(
      "NO_WRITABLE_CHARACTERISTIC",
      "This USB device does not expose a bulk output endpoint and cannot be used as a printer."
    );
  }

  try {
    await device.claimInterface(target.interfaceNumber);
  } catch (err) {
    await device.close();
    throw mapUsbError(err);
  }

  let disconnectListeners: (() => void)[] = [];
  const handleUsbDisconnect = (ev: Event) => {
    const connectionEvent = ev as USBConnectionEvent;
    if (connectionEvent.device === device) disconnectListeners.forEach((cb) => cb());
  };
  navigator.usb.addEventListener("disconnect", handleUsbDisconnect);

  const label = device.productName || `USB printer (${device.vendorId.toString(16)}:${device.productId.toString(16)})`;

  return {
    label,
    identity: { usbVendorId: device.vendorId, usbProductId: device.productId },
    async write(bytes: Uint8Array) {
      if (!device.opened) {
        throw new PrinterAdapterError("DISCONNECTED", "The printer disconnected. Reconnect and try again.");
      }
      try {
        // Copy into a plain ArrayBuffer — Uint8Array's default generic
        // (ArrayBufferLike) isn't assignable to WebUSB's BufferSource
        // typing, which wants a concrete ArrayBuffer.
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const result = await device.transferOut(target.endpointNumber, buffer);
        if (result.status !== "ok") {
          throw new PrinterAdapterError("WRITE_FAILED", `USB transfer ended with status "${result.status}".`);
        }
      } catch (err) {
        if (err instanceof PrinterAdapterError) throw err;
        throw new PrinterAdapterError(
          "WRITE_FAILED",
          `Failed to send data to the printer: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    async disconnect() {
      navigator.usb.removeEventListener("disconnect", handleUsbDisconnect);
      disconnectListeners = [];
      try {
        if (device.opened) {
          await device.releaseInterface(target.interfaceNumber);
          await device.close();
        }
      } catch {
        // best-effort teardown — device may already be gone
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

/**
 * Opens the native USB device chooser and connects to whatever the user
 * picks. Must be called from a user gesture (click handler).
 */
export async function connectUsbPrinter(): Promise<ConnectedPrinterHandle> {
  assertUsbUsable();

  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({ filters: [] });
  } catch (err) {
    throw mapUsbError(err);
  }

  return connectToDevice(device);
}

/**
 * Silently reconnects to a previously-authorized USB printer without
 * showing the device chooser, using navigator.usb.getDevices() (only
 * returns devices the user has already granted this site access to).
 */
export async function reconnectUsbPrinter(vendorId: number, productId: number): Promise<ConnectedPrinterHandle> {
  assertUsbUsable();

  const devices = await navigator.usb.getDevices();
  const device = devices.find((d) => d.vendorId === vendorId && d.productId === productId);
  if (!device) {
    throw new PrinterAdapterError(
      "NO_SELECTION",
      "This printer is no longer authorized in the browser. Reconnect it from Printer Settings."
    );
  }

  return connectToDevice(device);
}
