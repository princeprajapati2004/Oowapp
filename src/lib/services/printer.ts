import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { PrinterInput, PrinterUpdateInput } from "@/lib/validation/printer";

export async function listPrinters(shopId: string) {
  return db.printerProfile.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } });
}

async function assertOwnedPrinter(shopId: string, id: string) {
  const printer = await db.printerProfile.findFirst({ where: { id, shopId } });
  if (!printer) throw new NotFoundError("Printer not found");
  return printer;
}

/** Only the fields relevant to the printer's own connectionType are persisted — the rest are nulled so a Wi-Fi printer never carries around a stale Bluetooth device id, etc. */
function toPrinterData(input: PrinterInput) {
  return {
    name: input.name,
    connectionType: input.connectionType,
    paperSize: input.paperSize,
    purpose: input.purpose ?? null,
    isActive: input.isActive,
    ipAddress: input.connectionType === "WIFI" ? input.ipAddress ?? null : null,
    port: input.connectionType === "WIFI" ? input.port ?? 9100 : null,
    protocol: input.connectionType === "WIFI" ? input.protocol ?? "ESC_POS" : null,
    bluetoothDeviceId: input.connectionType === "BLUETOOTH" ? input.bluetoothDeviceId ?? null : null,
    bluetoothDeviceName: input.connectionType === "BLUETOOTH" ? input.bluetoothDeviceName ?? null : null,
    usbVendorId: input.connectionType === "USB" ? input.usbVendorId ?? null : null,
    usbProductId: input.connectionType === "USB" ? input.usbProductId ?? null : null,
  };
}

export async function createPrinter(shopId: string, input: PrinterInput) {
  return db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.printerProfile.updateMany({ where: { shopId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.printerProfile.create({
      data: { shopId, ...toPrinterData(input), isDefault: input.isDefault },
    });
  });
}

export async function updatePrinter(shopId: string, id: string, input: PrinterUpdateInput) {
  await assertOwnedPrinter(shopId, id);

  return db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.printerProfile.updateMany({ where: { shopId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    }
    return tx.printerProfile.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.connectionType !== undefined ? { connectionType: input.connectionType } : {}),
        ...(input.paperSize !== undefined ? { paperSize: input.paperSize } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
        ...(input.port !== undefined ? { port: input.port } : {}),
        ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
        ...(input.bluetoothDeviceId !== undefined ? { bluetoothDeviceId: input.bluetoothDeviceId } : {}),
        ...(input.bluetoothDeviceName !== undefined ? { bluetoothDeviceName: input.bluetoothDeviceName } : {}),
        ...(input.usbVendorId !== undefined ? { usbVendorId: input.usbVendorId } : {}),
        ...(input.usbProductId !== undefined ? { usbProductId: input.usbProductId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.statusMessage !== undefined ? { statusMessage: input.statusMessage } : {}),
        ...(input.lastConnectedAt !== undefined ? { lastConnectedAt: input.lastConnectedAt } : {}),
        ...(input.lastTestAt !== undefined ? { lastTestAt: input.lastTestAt } : {}),
        ...(input.lastTestSuccess !== undefined ? { lastTestSuccess: input.lastTestSuccess } : {}),
      },
    });
  });
}

export async function deletePrinter(shopId: string, id: string) {
  await assertOwnedPrinter(shopId, id);
  await db.printerProfile.delete({ where: { id } });
}
