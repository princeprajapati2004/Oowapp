// Server-side counterpart to src/lib/printing/print-service.ts: a Local
// Print Agent has no browser/DOM, so when a PrintJob targets an agent-backed
// printer the backend must render the ESC/POS bytes itself at job-creation
// time (rather than the browser building them and writing to a Bluetooth/USB
// handle). Reuses the exact same buildReceiptLines/renderEscPosReceipt used
// by the browser adapters and print-preview, so an agent-printed bill and a
// browser-printed bill for the same order are byte-for-byte identical.
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import { buildReceiptLines, buildTestPrintLines, THERMAL_CHAR_WIDTH } from "@/lib/printing/receipt-lines";
import { renderEscPosReceipt } from "@/lib/printing/escpos";
import { CONNECTION_TYPE_LABELS } from "@/lib/printer-status";
import type { BillOrderData, BillShopData, TaxLine } from "@/lib/hooks/use-bill-actions";
import type { PrintFormat, PrinterConnectionType } from "@/generated/prisma/enums";

function charWidthFor(format: PrintFormat): "58" | "80" {
  return format === "THERMAL_58" ? "58" : "80";
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function loadBillShopData(shopId: string): Promise<BillShopData> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      businessName: true,
      logoUrl: true,
      address: true,
      phone: true,
      whatsappNumber: true,
      gstNumber: true,
      currency: true,
      upiId: true,
      acceptCash: true,
      bankAccountNumber: true,
      bankName: true,
      bankIfsc: true,
      paymentQrImageUrl: true,
      paymentDisplayName: true,
      enableTableNumber: true,
      enableOrderBarcodeLabels: true,
      printFormat: true,
    },
  });
  if (!shop) throw new NotFoundError("Shop not found");
  return shop;
}

async function loadBillOrderData(shopId: string, orderId: string): Promise<BillOrderData> {
  const order = await db.order.findFirst({
    where: { id: orderId, shopId },
    include: { items: true },
  });
  if (!order) throw new NotFoundError("Order not found");

  return {
    id: order.id,
    billNumber: order.billNumber,
    tokenNumber: order.tokenNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    tableNumber: order.tableNumber,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    subtotal: Number(order.subtotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    taxBreakdown: (order.taxBreakdown as TaxLine[] | null) ?? [],
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paidAmount: order.paidAmount == null ? null : Number(order.paidAmount),
    transactionReference: order.transactionReference,
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    discountType: order.discountType,
    discountValue: order.discountValue == null ? null : Number(order.discountValue),
    discountReason: order.discountReason,
    discountedTotal: order.discountedTotal == null ? null : Number(order.discountedTotal),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
    })),
  };
}

export interface AgentPayloadArgs {
  shopId: string;
  documentType: "BILL" | "KITCHEN_TICKET" | "TEST";
  orderId: string | null;
  format: PrintFormat;
  printerName: string;
  printerConnectionType: PrinterConnectionType;
}

/**
 * Returns base64-encoded ESC/POS bytes ready for the agent to send straight
 * to the OS print spooler, or null when this document type has no
 * agent-printable representation yet (kitchen tickets — see AGENTS spec §23,
 * "don't over-engineer" — no KOT renderer exists in this codebase today).
 */
export async function buildAgentPrintPayload(args: AgentPayloadArgs): Promise<string | null> {
  const width = charWidthFor(args.format);

  if (args.documentType === "TEST") {
    const shop = await loadBillShopData(args.shopId);
    const lines = buildTestPrintLines({
      businessName: shop.businessName,
      printerName: args.printerName,
      connectionLabel: CONNECTION_TYPE_LABELS[args.printerConnectionType],
      paperLabel: args.format,
    });
    return toBase64(renderEscPosReceipt(lines, THERMAL_CHAR_WIDTH[width]));
  }

  if (args.documentType === "BILL") {
    if (!args.orderId) throw new NotFoundError("Order not found");
    const [shop, order] = await Promise.all([
      loadBillShopData(args.shopId),
      loadBillOrderData(args.shopId, args.orderId),
    ]);
    const lines = buildReceiptLines(order, shop, width);
    return toBase64(renderEscPosReceipt(lines, THERMAL_CHAR_WIDTH[width]));
  }

  return null;
}
