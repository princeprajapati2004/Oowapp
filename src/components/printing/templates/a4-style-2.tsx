import Image from "next/image";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { deriveBillFigures } from "@/lib/utils/bill-figures";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

const STATUS_BADGE: Record<"PAID" | "PARTIAL" | "UNPAID", { label: string; bg: string; fg: string }> = {
  PAID: { label: "PAID", bg: "#dcfce7", fg: "#166534" },
  PARTIAL: { label: "PARTIALLY PAID", bg: "#fef3c7", fg: "#92400e" },
  UNPAID: { label: "UNPAID", bg: "#fee2e2", fg: "#991b1b" },
};

// A4 Style 2 — Modern Restaurant Bill: SaaS/POS-style layout with a big
// "TAX INVOICE" mark, a clean meta strip, and a colored payment-status badge
// — visually distinct from Style 1's traditional business-invoice look.
export function A4Style2Invoice({ order, shop }: { order: BillOrderData; shop: BillShopData }) {
  const { date, dayTime } = formatOrderDateParts(order.createdAt);
  const { finalTotal, discountAmt, orderType, isPaid, paidAmount, balance } = deriveBillFigures(order);
  const statusKey = isPaid ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";
  const badge = STATUS_BADGE[statusKey];

  return (
    <div className="mx-auto bg-white text-black" style={{ width: "210mm", minHeight: "297mm", padding: "10mm" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {shop.logoUrl && (
            <Image src={shop.logoUrl} alt="" width={44} height={44} unoptimized className="rounded-full object-cover" />
          )}
          <p className="text-lg font-bold">{shop.businessName}</p>
        </div>
        <div className="rounded-full px-3 py-1 text-xs font-bold tracking-wide" style={{ backgroundColor: badge.bg, color: badge.fg }}>
          {badge.label}
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="text-3xl font-extrabold tracking-tight">{shop.gstNumber ? "TAX INVOICE" : "INVOICE"}</p>
        {shop.gstNumber && <p className="text-xs text-gray-500 mt-1">GSTIN {shop.gstNumber}</p>}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl p-4 text-sm" style={{ backgroundColor: "#f8fafc" }}>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Bill No.</p>
          <p className="font-semibold">{order.billNumber}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Date & Time</p>
          <p className="font-semibold">{date} · {dayTime.split(" • ")[1]}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Order Type</p>
          <p className="font-semibold">{orderType}</p>
        </div>
        {order.customerName && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Customer</p>
            <p className="font-semibold">{order.customerName}</p>
          </div>
        )}
        {order.tableNumber && shop.enableTableNumber && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Table</p>
            <p className="font-semibold">{order.tableNumber}</p>
          </div>
        )}
        {order.customerPhone && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Phone</p>
            <p className="font-semibold">{order.customerPhone}</p>
          </div>
        )}
      </div>

      <table className="mt-6 w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500" style={{ borderBottom: "2px solid #e2e8f0" }}>
            <th className="py-2">Item</th>
            <th className="py-2 text-center">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", pageBreakInside: "avoid" }}>
              <td className="py-2.5 font-medium">{item.name}</td>
              <td className="py-2.5 text-center text-gray-600">{item.quantity}</td>
              <td className="py-2.5 text-right text-gray-600">{formatCurrency(item.price, shop.currency)}</td>
              <td className="py-2.5 text-right font-semibold">{formatCurrency(item.lineTotal, shop.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-72 space-y-1.5 rounded-xl p-4 text-sm" style={{ backgroundColor: "#f8fafc" }}>
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotal, shop.currency)}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Discount</span>
              <span>-{formatCurrency(discountAmt, shop.currency)}</span>
            </div>
          )}
          {order.taxBreakdown.map((line) => (
            <div key={line.id} className="flex justify-between text-gray-600">
              <span>{line.name}</span>
              <span>{formatCurrency(line.amount, shop.currency)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 text-lg font-extrabold" style={{ borderTop: "2px solid #0f172a" }}>
            <span>Total</span>
            <span>{formatCurrency(finalTotal, shop.currency)}</span>
          </div>
          {order.paymentMethod && balance > 0 && (
            <div className="flex justify-between font-semibold" style={{ color: "#92400e" }}>
              <span>Balance Due</span>
              <span>{formatCurrency(balance, shop.currency)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
