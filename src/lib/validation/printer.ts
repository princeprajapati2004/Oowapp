import { z } from "zod";

export const printerConnectionTypeSchema = z.enum(["BLUETOOTH", "WIFI", "USB", "SYSTEM"]);
export const printerConnectionStatusSchema = z.enum(["DISCONNECTED", "CONNECTING", "CONNECTED", "ERROR", "UNSUPPORTED"]);
export const printFormatSchema = z.enum(["THERMAL_58", "THERMAL_80", "A4_STYLE_1", "A4_STYLE_2", "A4_STYLE_3", "A4_STYLE_4", "A3"]);

const printerBaseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  connectionType: printerConnectionTypeSchema,
  paperSize: printFormatSchema,
  purpose: z.string().trim().max(60).nullable().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  ipAddress: z.string().trim().max(255).nullable().optional(),
  port: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  protocol: z.string().trim().max(20).nullable().optional(),
  bluetoothDeviceId: z.string().trim().max(255).nullable().optional(),
  bluetoothDeviceName: z.string().trim().max(255).nullable().optional(),
  usbVendorId: z.coerce.number().int().nonnegative().nullable().optional(),
  usbProductId: z.coerce.number().int().nonnegative().nullable().optional(),
});

/** Full-object create schema — a resolved device identity (Bluetooth deviceId, USB vendor/product id, Wi-Fi IP) must already be present, since it only exists after a real connect attempt succeeded client-side. */
export const printerSchema = printerBaseSchema.superRefine((data, ctx) => {
  if (data.connectionType === "WIFI" && !data.ipAddress) {
    ctx.addIssue({ code: "custom", message: "IP address is required for Wi-Fi printers", path: ["ipAddress"] });
  }
  if (data.connectionType === "BLUETOOTH" && !data.bluetoothDeviceId) {
    ctx.addIssue({ code: "custom", message: "Connect to a Bluetooth device before saving", path: ["bluetoothDeviceId"] });
  }
  if (data.connectionType === "USB" && (data.usbVendorId == null || data.usbProductId == null)) {
    ctx.addIssue({ code: "custom", message: "Connect to a USB device before saving", path: ["usbVendorId"] });
  }
});
export type PrinterInput = z.infer<typeof printerSchema>;

/**
 * Partial update — this row is written to by two different real callers:
 * the Printer Settings edit form (name/paperSize/purpose/isDefault/isActive)
 * and the live connect/test flow reporting what actually happened
 * (status/statusMessage/lastConnectedAt/lastTestAt/lastTestSuccess), so
 * unlike the create schema every field here is optional.
 */
export const printerUpdateSchema = printerBaseSchema.partial().extend({
  status: printerConnectionStatusSchema.optional(),
  statusMessage: z.string().trim().max(500).nullable().optional(),
  lastConnectedAt: z.coerce.date().nullable().optional(),
  lastTestAt: z.coerce.date().nullable().optional(),
  lastTestSuccess: z.boolean().nullable().optional(),
});
export type PrinterUpdateInput = z.infer<typeof printerUpdateSchema>;

export const printJobDocumentTypeSchema = z.enum(["BILL", "KITCHEN_TICKET", "TEST"]);
export const printJobStatusSchema = z.enum(["PENDING", "PRINTING", "COMPLETED", "FAILED", "RETRYING", "CANCELLED"]);

export const printJobCreateSchema = z.object({
  printerId: z.string().trim().min(1).nullable().optional(),
  documentType: printJobDocumentTypeSchema,
  orderId: z.string().trim().min(1).nullable().optional(),
  format: printFormatSchema,
  // Optional caller-supplied dedupe key (e.g. `auto-bill:${orderId}`) — a
  // second create with the same (shopId, idempotencyKey) returns the
  // original job instead of creating a duplicate. See Order.clientRequestId
  // for the same pattern.
  idempotencyKey: z.string().trim().min(1).max(150).nullable().optional(),
});
export type PrintJobCreateInput = z.infer<typeof printJobCreateSchema>;

export const printJobUpdateSchema = z.object({
  status: printJobStatusSchema,
  errorMessage: z.string().trim().max(500).nullable().optional(),
});
export type PrintJobUpdateInput = z.infer<typeof printJobUpdateSchema>;
