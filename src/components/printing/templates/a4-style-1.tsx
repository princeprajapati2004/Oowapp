import Image from "next/image";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { PAYMENT_LABELS, paymentMethodLabel } from "@/lib/order-status";
import { deriveBillFigures } from "@/lib/utils/bill-figures";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

// A4 Style 1 — Professional Invoice: the traditional business-invoice
// layout (header block, invoice meta, customer block, itemized table,
// totals, payment info, signature line).
export function A4Style1Invoice({ order, shop }: { order: BillOrderData; shop: BillShopData }) {
  const { date } = formatOrderDateParts(order.createdAt);
  const { finalTotal, discountAmt, isPaid, paidAmount, balance } = deriveBillFigures(order);

  return (
    <div className="mx-auto bg-white text-black" style={{ width: "210mm", minHeight: "297mm", padding: "10mm" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="flex items-start gap-3">
          {shop.logoUrl && (
            <Image src={shop.logoUrl} alt="" width={56} height={56} unoptimized className="rounded object-cover" />
          )}
          <div>
            <p className="text-xl font-bold">{shop.businessName}</p>
            {shop.address && <p className="text-xs text-gray-600">{shop.address}</p>}
            <p className="text-xs text-gray-600">
              {[shop.phone, shop.gstNumber && `GSTIN: ${shop.gstNumber}`].filter(Boolean).join("  ·  ")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-wide">INVOICE</p>
          <p className="text-xs text-gray-600 mt-1">Invoice No: {order.billNumber}</p>
          <p className="text-xs text-gray-600">Invoice Date: {date}</p>
          <p className="mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: isPaid ? "#dcfce7" : "#fef3c7", color: isPaid ? "#166534" : "#92400e" }}>
            {isPaid ? PAYMENT_LABELS.PAID : (PAYMENT_LABELS[(order.paymentStatus as keyof typeof PAYMENT_LABELS) ?? "PENDING"] ?? "Unpaid")}
          </p>
        </div>
      </div>

      {/* Customer */}
      {(order.customerName || order.customerPhone || order.deliveryAddress) && (
        <div className="mt-4 rounded border border-gray-300 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Billed To</p>
          {order.customerName && <p className="text-sm font-medium">{order.customerName}</p>}
          {order.customerPhone && <p className="text-xs text-gray-600">{order.customerPhone}</p>}
          {order.deliveryAddress && <p className="text-xs text-gray-600">{order.deliveryAddress}</p>}
        </div>
      )}

      {/* Items table */}
      <table className="mt-5 w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="border-b-2 border-black text-left text-xs uppercase tracking-wide">
            <th className="py-2 pr-2 w-10">Sr.</th>
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2 text-center w-16">Qty</th>
            <th className="py-2 pr-2 text-right w-24">Rate</th>
            <th className="py-2 pr-0 text-right w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={item.id} className="border-b border-gray-200" style={{ pageBreakInside: "avoid" }}>
              <td className="py-2 pr-2 text-gray-500">{i + 1}</td>
              <td className="py-2 pr-2">{item.name}</td>
              <td className="py-2 pr-2 text-center">{item.quantity}</td>
              <td className="py-2 pr-2 text-right">{formatCurrency(item.price, shop.currency)}</td>
              <td className="py-2 pr-0 text-right font-medium">{formatCurrency(item.lineTotal, shop.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
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
          <div className="flex justify-between border-t-2 border-black pt-1.5 text-base font-bold">
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

      {/* Payment info */}
      {(shop.upiId || shop.bankAccountNumber || shop.acceptCash) && (
        <div className="mt-6 border-t border-gray-300 pt-3 text-xs text-gray-600">
          <p className="font-semibold text-gray-800">Payment Information</p>
          {shop.upiId && <p>UPI: {shop.upiId} ({shop.paymentDisplayName || shop.businessName})</p>}
          {shop.bankAccountNumber && (
            <p>
              Bank: {shop.bankName} · A/C {shop.bankAccountNumber}
              {shop.bankIfsc && ` · IFSC ${shop.bankIfsc}`}
            </p>
          )}
          {shop.acceptCash && <p>Cash accepted</p>}
        </div>
      )}

      {/* Signature */}
      <div className="mt-16 flex justify-end" style={{ pageBreakInside: "avoid" }}>
        <div className="w-56 text-center">
          <div className="border-t border-gray-400 pt-1 text-xs text-gray-600">Authorized Signature</div>
        </div>
      </div>
    </div>
  );
}
