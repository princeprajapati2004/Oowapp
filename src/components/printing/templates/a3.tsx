import Image from "next/image";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { PAYMENT_LABELS, paymentMethodLabel } from "@/lib/order-status";
import { deriveBillFigures } from "@/lib/utils/bill-figures";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

// A3 — large-format professional invoice for wholesale/catering/bulk
// orders: same professional-invoice structure as Style 1, scaled up with
// bigger type and a roomier item table rather than a fourth from-scratch
// design, per the print spec's own description of A3's purpose.
export function A3Invoice({ order, shop }: { order: BillOrderData; shop: BillShopData }) {
  const { date } = formatOrderDateParts(order.createdAt);
  const { finalTotal, discountAmt, isPaid, paidAmount, balance } = deriveBillFigures(order);

  return (
    <div className="mx-auto bg-white text-black" style={{ width: "297mm", minHeight: "420mm", padding: "12mm", fontSize: "13px" }}>
      <div className="flex items-start justify-between gap-8 border-b-4 border-black pb-6">
        <div className="flex items-start gap-4">
          {shop.logoUrl && (
            <Image src={shop.logoUrl} alt="" width={80} height={80} unoptimized className="rounded object-cover" />
          )}
          <div>
            <p className="text-3xl font-bold">{shop.businessName}</p>
            {shop.address && <p className="text-sm text-gray-600 mt-1">{shop.address}</p>}
            <p className="text-sm text-gray-600">
              {[shop.phone, shop.gstNumber && `GSTIN: ${shop.gstNumber}`].filter(Boolean).join("  ·  ")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold tracking-wide">INVOICE</p>
          <p className="text-sm text-gray-600 mt-2">Invoice No: {order.billNumber}</p>
          <p className="text-sm text-gray-600">Invoice Date: {date}</p>
          <p className="mt-2 inline-block rounded px-3 py-1 text-sm font-semibold" style={{ backgroundColor: isPaid ? "#dcfce7" : "#fef3c7", color: isPaid ? "#166534" : "#92400e" }}>
            {isPaid ? PAYMENT_LABELS.PAID : (PAYMENT_LABELS[(order.paymentStatus as keyof typeof PAYMENT_LABELS) ?? "PENDING"] ?? "Unpaid")}
          </p>
        </div>
      </div>

      {(order.customerName || order.customerPhone || order.deliveryAddress) && (
        <div className="mt-6 rounded border border-gray-300 p-4" style={{ maxWidth: 420 }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Billed To</p>
          {order.customerName && <p className="text-lg font-medium">{order.customerName}</p>}
          {order.customerPhone && <p className="text-sm text-gray-600">{order.customerPhone}</p>}
          {order.deliveryAddress && <p className="text-sm text-gray-600">{order.deliveryAddress}</p>}
        </div>
      )}

      <table className="mt-8 w-full text-base" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="border-b-4 border-black text-left text-sm uppercase tracking-wide">
            <th className="py-3 pr-3 w-16">Sr.</th>
            <th className="py-3 pr-3">Product</th>
            <th className="py-3 pr-3 text-center w-24">Qty</th>
            <th className="py-3 pr-3 text-right w-32">Rate</th>
            <th className="py-3 pr-0 text-right w-40">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={item.id} className="border-b border-gray-200" style={{ pageBreakInside: "avoid" }}>
              <td className="py-3 pr-3 text-gray-500">{i + 1}</td>
              <td className="py-3 pr-3">{item.name}</td>
              <td className="py-3 pr-3 text-center">{item.quantity}</td>
              <td className="py-3 pr-3 text-right">{formatCurrency(item.price, shop.currency)}</td>
              <td className="py-3 pr-0 text-right font-medium">{formatCurrency(item.lineTotal, shop.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="space-y-2 text-base" style={{ width: 384 }}>
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
          <div className="flex justify-between border-t-4 border-black pt-2 text-2xl font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(finalTotal, shop.currency)}</span>
          </div>
          {order.paymentMethod && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>Paid ({paymentMethodLabel(order.paymentMethod)})</span>
                <span>{formatCurrency(paidAmount, shop.currency)}</span>
              </div>
              {balance > 0 && (
                <div className="flex justify-between font-semibold" style={{ color: "#92400e" }}>
                  <span>Balance Due</span>
                  <span>{formatCurrency(balance, shop.currency)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-24 flex justify-end" style={{ pageBreakInside: "avoid" }}>
        <div className="w-72 text-center">
          <div className="border-t border-gray-400 pt-2 text-sm text-gray-600">Authorized Signature</div>
        </div>
      </div>
    </div>
  );
}
