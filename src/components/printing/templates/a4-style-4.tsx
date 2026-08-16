import Image from "next/image";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { paymentMethodLabel } from "@/lib/order-status";
import { deriveBillFigures } from "@/lib/utils/bill-figures";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

// A4 Style 4 — Simple Professional Receipt: minimal, large type, one big
// GRAND TOTAL — the plainest of the four, for shops that just want a clean
// readable receipt rather than a formal invoice.
export function A4Style4Invoice({ order, shop }: { order: BillOrderData; shop: BillShopData }) {
  const { date, dayTime } = formatOrderDateParts(order.createdAt);
  const { finalTotal, isPaid } = deriveBillFigures(order);
  const qr = shop.paymentQrImageUrl;

  return (
    <div className="mx-auto bg-white text-black" style={{ width: "210mm", minHeight: "297mm", padding: "14mm" }}>
      <div className="text-center">
        {shop.logoUrl && (
          <Image src={shop.logoUrl} alt="" width={64} height={64} unoptimized className="mx-auto mb-2 rounded-full object-cover" />
        )}
        <p className="text-2xl font-bold">{shop.businessName}</p>
        {shop.address && <p className="text-sm text-gray-500">{shop.address}</p>}
        {shop.phone && <p className="text-sm text-gray-500">{shop.phone}</p>}
      </div>

      <div className="mt-6 flex justify-between text-sm text-gray-600">
        <span>Bill #{order.billNumber} · {date} · {dayTime.split(" • ")[1]}</span>
        {order.customerName && <span>{order.customerName}</span>}
      </div>

      <table className="mt-4 w-full text-base" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="text-left" style={{ borderBottom: "2px solid #0f172a" }}>
            <th className="py-2">Item</th>
            <th className="py-2 text-center">Qty</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} style={{ borderBottom: "1px solid #e5e7eb", pageBreakInside: "avoid" }}>
              <td className="py-3">{item.name}</td>
              <td className="py-3 text-center text-gray-500">{item.quantity}</td>
              <td className="py-3 text-right font-medium">{formatCurrency(item.lineTotal, shop.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 flex items-center justify-between rounded-2xl p-6" style={{ backgroundColor: "#0f172a" }}>
        <span className="text-lg font-semibold text-white">GRAND TOTAL</span>
        <span className="text-3xl font-extrabold text-white">{formatCurrency(finalTotal, shop.currency)}</span>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="font-semibold" style={{ color: isPaid ? "#166534" : "#92400e" }}>
          {isPaid ? "PAID" : "PAYMENT PENDING"}
          {order.paymentMethod && ` · ${paymentMethodLabel(order.paymentMethod)}`}
        </span>
        {qr && (
          <Image src={qr} alt="Scan to pay" width={80} height={80} unoptimized className="rounded border" />
        )}
      </div>

      <p className="mt-10 text-center text-lg font-semibold text-gray-700">Thank you for your business!</p>
    </div>
  );
}
