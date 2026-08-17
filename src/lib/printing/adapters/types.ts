// Shared contract every connection-type adapter (Bluetooth, USB, Wi-Fi
// bridge, system print) implements — one error taxonomy and one connected-
// handle shape so print-service.ts can dispatch without knowing which
// transport it's talking to.

export type PrinterAdapterErrorCode =
  | "NOT_SUPPORTED"
  | "INSECURE_CONTEXT"
  | "BLUETOOTH_DISABLED"
  | "PERMISSION_DENIED"
  | "NO_SELECTION"
  | "NO_COMPATIBLE_SERVICE"
  | "NO_WRITABLE_CHARACTERISTIC"
  | "CONNECTION_FAILED"
  | "WRITE_FAILED"
  | "DISCONNECTED"
  | "TIMEOUT";

export class PrinterAdapterError extends Error {
  code: PrinterAdapterErrorCode;
  constructor(code: PrinterAdapterErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PrinterAdapterError";
  }
}

export interface ConnectedPrinterHandle {
  /** Human-readable device identity for status display (device name, or a fallback). */
  label: string;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
  /** Registers a callback for an unrequested drop (device powered off, out of range, bridge died). Returns an unsubscribe function. */
  onUnexpectedDisconnect(cb: () => void): () => void;
  /** Adapter-specific identity to persist on the PrinterProfile for reconnect — shape varies per connectionType (Bluetooth: deviceId/deviceName, USB: vendorId/productId, Wi-Fi: ip/port). */
  identity?: Record<string, string | number>;
}
