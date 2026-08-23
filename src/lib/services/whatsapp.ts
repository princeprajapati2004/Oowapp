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
  // Set when a coupon was applied — this is a client-side preview (from
  // POST /api/coupons/validate), not the authoritative discount; the order
  // actually saved via the parallel POST /api/orders call is what's
  // authoritative if the two ever disagree (see the coupon validate route's
  // doc comment on the accepted preview-vs-commit race).
  discount?: { label: string; amount: number };
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
  if (input.discount) {
    lines.push(`${input.discount.label}:`, `-${formatCurrency(input.discount.amount, input.currency)}`);
  }
  lines.push("");
  const finalTotal = input.discount
    ? Math.max(0, input.bill.grandTotal - input.discount.amount)
    : input.bill.grandTotal;
  lines.push("Grand Total:", formatCurrency(finalTotal, input.currency));

  if (input.notes) {
    lines.push("", "Notes:", input.notes);
  }

  lines.push("", "Thank You");

  return lines.join("\n");
}

export interface IncrementalOrderMessageInput {
  tableNumber: string;
  roundNumber: number;
  deltaItems: CartItem[];
  deltaBill: BillTotals;
  sessionBill: BillTotals;
  currency: string;
  notes?: string;
}

/** WhatsApp message for the 2nd+ order against an already-active table session — lists only the newly added items, never the full prior order. */
export function buildIncrementalOrderMessage(input: IncrementalOrderMessageInput) {
  const lines: string[] = [`*Additional Order — Table ${input.tableNumber} (Round ${input.roundNumber})*`, ""];

  lines.push("Items added:", "");
  for (const item of input.deltaItems) {
    lines.push(`${item.quantity} x ${item.name} = ${formatCurrency(item.price * item.quantity, input.currency)}`);
  }
  lines.push("");

  lines.push("This round total:", formatCurrency(input.deltaBill.grandTotal, input.currency));
  lines.push("");
  lines.push("Table running total:", formatCurrency(input.sessionBill.grandTotal, input.currency));

  if (input.notes) {
    lines.push("", "Notes:", input.notes);
  }

  lines.push("", "Thank You");

  return lines.join("\n");
}

export function buildWhatsAppUrl(phoneNumber: string, message: string) {
  // wa.me requires digits only — no leading +, spaces, or dashes.
  const digits = phoneNumber.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

