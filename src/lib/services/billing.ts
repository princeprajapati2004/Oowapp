export interface BillLineItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  categoryId: string;
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
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
        amount = tax.type === "PERCENTAGE" ? (subtotal * tax.value) / 100 : tax.value;
      }
      return { id: tax.id, name: tax.name, amount: round2(amount) };
    })
    .filter((line) => line.amount > 0);

  const taxTotal = round2(taxLines.reduce((sum, line) => sum + line.amount, 0));
  const grandTotal = round2(subtotal + taxTotal);

  return { subtotal: round2(subtotal), taxLines, taxTotal, grandTotal };
}
