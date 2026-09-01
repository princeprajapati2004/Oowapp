export interface BillLineItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  categoryId: string;
  imageUrl?: string | null;
}

export interface BillTax {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  appliesTo: "ENTIRE_BILL" | "CATEGORY";
  categoryId?: string | null;
  isEnabled: boolean;
}

export interface BillTaxLine {
  id: string;
  name: string;
  amount: number;
}

export interface BillTotals {
  subtotal: number;
  taxLines: BillTaxLine[];
  taxTotal: number;
  grandTotal: number;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Merges line items by (id, name, price), summing quantity — used to combine
 * a table session's multiple order rounds into one bill before running
 * calculateBill, so tax math runs once on the true combined subtotal instead
 * of being summed from already-rounded per-round totals.
 */
export function mergeLineItems(items: BillLineItem[]): BillLineItem[] {
  const merged = new Map<string, BillLineItem>();
  for (const item of items) {
    const key = `${item.id}::${item.name}::${item.price}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, { ...item });
    }
  }
  return Array.from(merged.values());
}

/** Single source of truth for bill math — used by the admin tax preview, the customer bill screen, and the WhatsApp message. */
export function calculateBill(items: BillLineItem[], taxes: BillTax[]): BillTotals {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const taxLines = taxes
    .filter((tax) => tax.isEnabled)
    .map((tax) => {
      let amount = 0;
      if (tax.appliesTo === "CATEGORY") {
        const base = items
          .filter((item) => item.categoryId === tax.categoryId)
          .reduce((sum, item) => sum + item.price * item.quantity, 0);
        if (base > 0) {
          amount = tax.type === "PERCENTAGE" ? (base * tax.value) / 100 : tax.value;
        }
      } else {
        // FIXED taxes on ENTIRE_BILL (e.g. delivery fees) always apply when the cart is
        // non-empty. There is no minimum-order threshold — that is intentional by design.
        amount = tax.type === "PERCENTAGE" ? (subtotal * tax.value) / 100 : tax.value;
      }
      return { id: tax.id, name: tax.name, amount: round2(amount) };
    })
    .filter((line) => line.amount > 0);

  const taxTotal = round2(taxLines.reduce((sum, line) => sum + line.amount, 0));
  const grandTotal = round2(subtotal + taxTotal);

  return { subtotal: round2(subtotal), taxLines, taxTotal, grandTotal };
}
