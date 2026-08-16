import type { BillOrderData } from "@/lib/hooks/use-bill-actions";

/**
 * Dummy order for Settings → Print Settings' Preview/Test Print — never
 * touches the database, never becomes a real order (print spec §10, §31).
 * Shop info in the preview is the real shop's (already visible elsewhere in
 * Settings), only the order itself is fabricated.
 */
export function sampleBillOrder(): BillOrderData {
  return {
    id: "sample",
    billNumber: "TEST-0001",
    tokenNumber: 1,
    customerName: "Sample Customer",
    customerPhone: "9876543210",
    tableNumber: "4",
    deliveryAddress: null,
    notes: null,
    subtotal: 100,
    taxTotal: 0,
    grandTotal: 100,
    taxBreakdown: [],
    status: "COMPLETED",
    paymentMethod: "CASH",
    paymentStatus: "PAID",
    paidAmount: 100,
    transactionReference: null,
    discountType: null,
    discountValue: null,
    discountReason: null,
    discountedTotal: null,
    createdAt: new Date().toISOString(),
    items: [{ id: "sample-item", name: "Sample Item", price: 100, quantity: 1, lineTotal: 100 }],
  };
}
