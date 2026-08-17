import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { PAYMENT_LABELS, paymentMethodLabel } from "@/lib/order-status";
import { deriveBillFigures } from "@/lib/utils/bill-figures";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";
import type { ReceiptLine } from "./escpos";

export const THERMAL_CHAR_WIDTH: Record<"58" | "80", number> = { "58": 32, "80": 48 };

/**
 * Same content as the on-screen ThermalReceipt template (2-inch/3-inch —
 * see components/printing/templates/thermal-receipt.tsx), expressed as a
 * width-agnostic line list so a real thermal printer (via ESC/POS) and the
 * screen preview always say the same thing, computed from the same
 * deriveBillFigures() the rest of the app already uses.
 */
export function buildReceiptLines(order: BillOrderData, shop: BillShopData, width: "58" | "80"): ReceiptLine[] {
  const wide = width === "80";
  const { date, dayTime } = formatOrderDateParts(order.createdAt);
  const { finalTotal, discountAmt, orderType, isPaid, paidAmount, balance } = deriveBillFigures(order);
  const lines: ReceiptLine[] = [];

  lines.push({ kind: "text", text: shop.businessName, align: "center", bold: true, big: true });
  if (shop.address) lines.push({ kind: "text", text: shop.address, align: "center" });
  if (shop.phone) lines.push({ kind: "text", text: `Ph: ${shop.phone}`, align: "center" });
  if (shop.gstNumber) lines.push({ kind: "text", text: `GSTIN: ${shop.gstNumber}`, align: "center" });
  lines.push({ kind: "divider" });

  lines.push({ kind: "row", left: "Bill No", right: order.billNumber });
  lines.push({ kind: "row", left: "Date", right: date });
  lines.push({ kind: "row", left: "Time", right: dayTime.split(" • ")[1] ?? "" });
  if (order.customerName) lines.push({ kind: "row", left: "Customer", right: order.customerName });
  if (wide && order.tableNumber && shop.enableTableNumber) {
    lines.push({ kind: "row", left: "Table", right: order.tableNumber });
  }
  lines.push({ kind: "row", left: "Order Type", right: orderType });
  lines.push({ kind: "divider" });

  for (const item of order.items) {
    if (wide) {
      lines.push({ kind: "text", text: item.name });
      lines.push({
        kind: "row",
        left: `  ${item.quantity} x ${formatCurrency(item.price, shop.currency)}`,
        right: formatCurrency(item.lineTotal, shop.currency),
      });
    } else {
      lines.push({ kind: "text", text: item.name });
      lines.push({
        kind: "row",
        left: `${item.quantity} x ${formatCurrency(item.price, shop.currency)}`,
        right: formatCurrency(item.lineTotal, shop.currency),
      });
    }
  }
  lines.push({ kind: "divider" });

  lines.push({ kind: "row", left: "Subtotal", right: formatCurrency(order.subtotal, shop.currency) });
  if (discountAmt > 0) lines.push({ kind: "row", left: "Discount", right: `-${formatCurrency(discountAmt, shop.currency)}` });
  for (const tax of order.taxBreakdown) {
    lines.push({ kind: "row", left: tax.name, right: formatCurrency(tax.amount, shop.currency) });
  }
  lines.push({ kind: "divider" });
  lines.push({ kind: "row", left: "Grand Total", right: formatCurrency(finalTotal, shop.currency), bold: true });
  if (order.paymentMethod) {
    lines.push({ kind: "row", left: "Paid", right: formatCurrency(paidAmount, shop.currency) });
    if (balance > 0) lines.push({ kind: "row", left: "Balance", right: formatCurrency(balance, shop.currency) });
  }
  lines.push({ kind: "divider" });

  if (order.paymentMethod) lines.push({ kind: "row", left: "Payment Method", right: paymentMethodLabel(order.paymentMethod) });
  const statusLabel = isPaid ? PAYMENT_LABELS.PAID : (PAYMENT_LABELS[(order.paymentStatus as keyof typeof PAYMENT_LABELS) ?? "PENDING"] ?? "Unpaid");
  lines.push({ kind: "row", left: "Payment Status", right: statusLabel });
  lines.push({ kind: "divider" });
  lines.push({ kind: "text", text: "Thank You!", align: "center", bold: true });

  return lines;
}

/** The small connectivity test receipt (print spec §13/§31) — never a real bill. */
export function buildTestPrintLines(args: {
  businessName: string;
  printerName: string;
  connectionLabel: string;
  paperLabel: string;
}): ReceiptLine[] {
  const now = new Date();
  return [
    { kind: "text", text: "PRINTER TEST", align: "center", bold: true, big: true },
    { kind: "divider" },
    { kind: "text", text: args.businessName, align: "center" },
    { kind: "row", left: "Printer", right: args.printerName },
    { kind: "row", left: "Connection", right: args.connectionLabel },
    { kind: "row", left: "Paper", right: args.paperLabel },
    { kind: "row", left: "Date", right: now.toLocaleDateString() },
    { kind: "row", left: "Time", right: now.toLocaleTimeString() },
    { kind: "divider" },
    { kind: "text", text: "******** PRINT TEST ********", align: "center" },
    { kind: "feed", lines: 1 },
    { kind: "text", text: "Printer connection successful.", align: "center" },
  ];
}
