import { formatCurrency } from "@/lib/utils/currency";
import type { BillTotals } from "@/lib/services/billing";
import type { CartItem } from "@/lib/hooks/use-cart";

export interface OrderMessageInput {
  customerName?: string;
  customerPhone?: string;
  tableNumber?: string;
  deliveryAddress?: string;
  notes?: string;
  items: CartItem[];
  bill: BillTotals;
  currency: string;
}

/** Exact "New Order" message format from the product spec — single source of truth for the WhatsApp order text. */
export function buildOrderMessage(input: OrderMessageInput) {
  const lines: string[] = ["*New Order*", ""];

  if (input.customerName) {
    lines.push("Customer:", input.customerName, "");
  }
  if (input.customerPhone) {
    lines.push("Phone:", input.customerPhone, "");
  }
  if (input.tableNumber) {
    lines.push("Table:", input.tableNumber, "");
  }
  if (input.deliveryAddress) {
    lines.push("Delivery Address:", input.deliveryAddress, "");
  }

  lines.push("Items", "");
  for (const item of input.items) {
    lines.push(`${item.quantity} x ${item.name} = ${formatCurrency(item.price * item.quantity, input.currency)}`);
  }
  lines.push("");

  lines.push("Subtotal:", formatCurrency(input.bill.subtotal, input.currency));
  for (const line of input.bill.taxLines) {
    lines.push(`${line.name}:`, formatCurrency(line.amount, input.currency));
  }
  lines.push("");
  lines.push("Grand Total:", formatCurrency(input.bill.grandTotal, input.currency));

  if (input.notes) {
    lines.push("", "Notes:", input.notes);
  }

  lines.push("", "Thank You");

  return lines.join("\n");
}

export function buildWhatsAppUrl(phoneNumber: string, message: string) {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
}

export function generateBillNumber(shopSlug: string) {
  const prefix = shopSlug.slice(0, 4).toUpperCase();
  return `${prefix}-${Date.now()}`;
}
