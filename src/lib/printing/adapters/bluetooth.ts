"use client";

// Real Web Bluetooth (GATT) printer adapter. No simulated devices, no fake
// "connected" state — every function here either talks to an actual
// navigator.bluetooth API and reports what it returns, or throws a
// PrinterAdapterError describing exactly what's missing.
//
// Browser privacy restriction that shapes this whole file: Web Bluetooth
// does not let a page enumerate a device's services freely — every service
// UUID you might touch after connecting has to be declared up front in
// requestDevice()'s optionalServices. There is no "list everything"
// escape hatch. So this adapter declares a curated list of GATT
// service/characteristic UUID pairs used by common BLE thermal printer
// modules, and after connecting, checks the device against each in turn.
// A printer that uses a service outside this list (or, more commonly,
// classic Bluetooth SPP rather than BLE GATT at all) will honestly report
// NO_COMPATIBLE_SERVICE — never a fabricated success.

import { getPrinterCapabilities } from "../capability";
import { PrinterAdapterError, type ConnectedPrinterHandle } from "./types";

const KNOWN_PRINTER_SERVICES: { service: string; writeCharacteristics: string[] }[] = [
  // HM-10 / JDY-08 style BLE-serial modules — by far the most common chip
  // inside budget 58mm/80mm BLE thermal printers.
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", writeCharacteristics: ["0000ffe1-0000-1000-8000-00805f9b34fb"] },
  // Nordic UART Service (NUS) — nRF52-based printer boards.
  { service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", writeCharacteristics: ["6e400002-b5a3-f393-e0a9-e50e24dcca9e"] },
  // Microchip/ISSC "transparent UART" service — RN42/RN4677-based modules.
  { service: "49535343-fe7d-4ae5-8fa9-a11fb7ce4880", writeCharacteristics: ["49535343-1e4d-4bd9-ba61-23c647249616"] },
];

// Conservative default ATT MTU (23 bytes) minus the 3-byte ATT write-command
// header, plus a short pause between chunks — cheap printer BLE stacks drop
// bytes if you flood them faster than their RX buffer drains.
const WRITE_CHUNK_BYTES = 20;
const WRITE_CHUNK_DELAY_MS = 20;

function mapGattError(err: unknown): PrinterAdapterError {
  const name = err instanceof DOMException ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "NotFoundError") {
    return new PrinterAdapterError(
      "NO_SELECTION",
      "No Bluetooth printer was selected, or none was found nearby. Make sure the printer is powered on and in pairing/discoverable mode."
    );
  }
  if (name === "SecurityError" || name === "NotAllowedError") {
    return new PrinterAdapterError("PERMISSION_DENIED", "Bluetooth permission was denied. Allow Bluetooth access for this site and try again.");
  }
  if (name === "NetworkError") {
    return new PrinterAdapterError(
      "CONNECTION_FAILED",
      "Could not connect to the printer. It may be out of range, already connected to another device, or powered off."
    );
  }
  return new PrinterAdapterError("CONNECTION_FAILED", `Bluetooth connection failed: ${message}`);
}

function assertBluetoothUsable(): void {
  const caps = getPrinterCapabilities();
  if (!caps.bluetooth.apiPresent) {
    throw new PrinterAdapterError("NOT_SUPPORTED", caps.bluetooth.reason ?? "Bluetooth printing is not supported on this device/browser.");
  }
  if (!caps.isSecureContext) {
    throw new PrinterAdapterError("INSECURE_CONTEXT", caps.bluetooth.reason ?? "Bluetooth printing requires a secure (HTTPS) connection.");
  }
}

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic> {
  let sawKnownService = false;

  for (const { service, writeCharacteristics } of KNOWN_PRINTER_SERVICES) {
    let svc: BluetoothRemoteGATTService;
    try {
      svc = await server.getPrimaryService(service);
    } catch {
      continue; // this device doesn't expose this particular known service
    }
    sawKnownService = true;

    for (const charUuid of writeCharacteristics) {
      try {
        const char = await svc.getCharacteristic(charUuid);
        if (char.properties.write || char.properties.writeWithoutResponse) {
          return char;
        }
      } catch {
        // declared characteristic not present on this device's copy of the service
      }
    }
  }

  if (sawKnownService) {
    throw new PrinterAdapterError(
      "NO_WRITABLE_CHARACTERISTIC",
      "This printer's Bluetooth service was found, but it has no writable characteristic this app recognizes."
    );
  }
  throw new PrinterAdapterError(
    "NO_COMPATIBLE_SERVICE",
    "This Bluetooth device does not expose a compatible printer service. Many thermal printers use classic Bluetooth (SPP), which browsers cannot access directly — connect it to a Windows PC and use the Local Print Agent instead."
  );
}

async function connectToDevice(device: BluetoothDevice): Promise<ConnectedPrinterHandle> {
  if (!device.gatt) {
    throw new PrinterAdapterError("CONNECTION_FAILED", "This device does not expose a GATT server and cannot be used for printing.");
  }

  let server: BluetoothRemoteGATTServer;
  try {
    server = await device.gatt.connect();
  } catch (err) {
    throw mapGattError(err);
  }

  let characteristic: BluetoothRemoteGATTCharacteristic;
  try {
    characteristic = await findWritableCharacteristic(server);
  } catch (err) {
    server.disconnect();
    throw err;
  }

  const preferNoResponse = characteristic.properties.writeWithoutResponse;
  let disconnectListeners: (() => void)[] = [];
  const handleGattDisconnect = () => disconnectListeners.forEach((cb) => cb());
  device.addEventListener("gattserverdisconnected", handleGattDisconnect);

  return {
    label: device.name || "Bluetooth printer",
    identity: { bluetoothDeviceId: device.id, bluetoothDeviceName: device.name ?? "" },
    async write(bytes: Uint8Array) {
      if (!server.connected) {
        throw new PrinterAdapterError("DISCONNECTED", "The printer disconnected. Reconnect and try again.");
      }
      try {
        for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_BYTES) {
          const chunk = bytes.slice(offset, offset + WRITE_CHUNK_BYTES);
          if (preferNoResponse) {
            await characteristic.writeValueWithoutResponse(chunk);
          } else {
            await characteristic.writeValueWithResponse(chunk);
          }
          if (offset + WRITE_CHUNK_BYTES < bytes.length) {
            await new Promise((resolve) => setTimeout(resolve, WRITE_CHUNK_DELAY_MS));
          }
        }
      } catch (err) {
        throw new PrinterAdapterError(
          "WRITE_FAILED",
          `Failed to send data to the printer: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    async disconnect() {
      device.removeEventListener("gattserverdisconnected", handleGattDisconnect);
      disconnectListeners = [];
      if (device.gatt?.connected) device.gatt.disconnect();
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
 * Opens the native Bluetooth device chooser and connects to whatever the
 * user picks. Must be called from a user gesture (click handler) — the
 * browser enforces this, it isn't a convention here.
 */
export async function connectBluetoothPrinter(): Promise<ConnectedPrinterHandle> {
  assertBluetoothUsable();

  if (typeof navigator.bluetooth.getAvailability === "function") {
    const available = await navigator.bluetooth.getAvailability();
    if (!available) {
      throw new PrinterAdapterError(
        "BLUETOOTH_DISABLED",
        "Bluetooth is turned off on this device. Turn it on and try again."
      );
    }
  }

  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_PRINTER_SERVICES.map((s) => s.service),
    });
  } catch (err) {
    throw mapGattError(err);
  }

  return connectToDevice(device);
}

/**
 * Silently reconnects to a previously-paired printer without showing the
 * device chooser, using the Web Bluetooth persistent-permissions API
 * (Chrome/Edge). Falls back to an honest NOT_SUPPORTED / NO_SELECTION
 * error rather than pretending to reconnect — callers should fall back to
 * connectBluetoothPrinter() (fresh picker) on failure.
 */
export async function reconnectBluetoothPrinter(deviceId: string): Promise<ConnectedPrinterHandle> {
  assertBluetoothUsable();

  if (typeof navigator.bluetooth.getDevices !== "function") {
    throw new PrinterAdapterError(
      "NOT_SUPPORTED",
      "Silent Bluetooth reconnect is not supported in this browser. Reconnect manually from Printer Settings."
    );
  }

  const devices = await navigator.bluetooth.getDevices();
  const device = devices.find((d) => d.id === deviceId);
  if (!device) {
    throw new PrinterAdapterError(
      "NO_SELECTION",
      "This printer is no longer paired with the browser. Reconnect it from Printer Settings."
    );
  }

  return connectToDevice(device);
}
