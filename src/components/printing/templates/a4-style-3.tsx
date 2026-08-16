import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { deriveBillFigures } from "@/lib/utils/bill-figures";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

// A4 Style 3 — Detailed Tax Invoice: seller/buyer blocks and a real tax
// summary (named exactly as the shop configured its taxes — never a
// fabricated CGST/SGST/IGST split, since per-item tax isn't tracked in the
// order data at all; inventing one would violate "no fake GST values").
export function A4Style3Invoice({ order, shop }: { order: BillOrderData; shop: BillShopData }) {
  const { date } = formatOrderDateParts(order.createdAt);
  const { finalTotal, discountAmt, isPaid, paidAmount, balance } = deriveBillFigures(order);

  return (
    <div className="mx-auto bg-white text-black" style={{ width: "210mm", minHeight: "297mm", padding: "10mm" }}>
      <div className="text-center border-b-2 border-black pb-3">
        <p className="text-xl font-bold tracking-wide">TAX INVOICE</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="rounded border border-gray-300 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Seller</p>
          <p className="font-semibold">{shop.businessName}</p>
          {shop.address && <p className="text-xs text-gray-600">{shop.address}</p>}
          {shop.phone && <p className="text-xs text-gray-600">Ph: {shop.phone}</p>}
          {shop.gstNumber && <p className="text-xs text-gray-600">GSTIN: {shop.gstNumber}</p>}
        </div>
        <div className="rounded border border-gray-300 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Buyer</p>
          <p className="font-semibold">{order.customerName || "Walk-in Customer"}</p>
          {order.customerPhone && <p className="text-xs text-gray-600">Ph: {order.customerPhone}</p>}
          {order.deliveryAddress && <p className="text-xs text-gray-600">{order.deliveryAddress}</p>}
        </div>
      </div>

      <div className="mt-3 flex justify-between text-xs text-gray-600">
        <span>Invoice No: <span className="font-semibold text-black">{order.billNumber}</span></span>
        <span>Invoice Date: <span className="font-semibold text-black">{date}</span></span>
      </div>

      <table className="mt-4 w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="border-b-2 border-black text-left text-xs uppercase tracking-wide">
            <th className="py-2 pr-2 w-10">Sr.</th>
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2 text-center w-16">Qty</th>
            <th className="py-2 pr-2 text-right w-24">Rate</th>
            <th className="py-2 pr-0 text-right w-28">Taxable Value</th>
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

      <div className="mt-4 grid grid-cols-2 gap-6">
        {/* Tax summary — real configured taxes only */}
        <div className="text-xs">
          <p className="font-semibold text-gray-800 mb-1">Tax Summary</p>
          {order.taxBreakdown.length === 0 ? (
            <p className="text-gray-500">No tax applicable on this invoice.</p>
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <tbody>
                {order.taxBreakdown.map((line) => (
                  <tr key={line.id} className="border-b border-gray-200">
                    <td className="py-1 text-gray-600">{line.name}</td>
                    <td className="py-1 text-right">{formatCurrency(line.amount, shop.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Taxable Amount</span>
            <span>{formatCurrency(order.subtotal, shop.currency)}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Discount</span>
              <span>-{formatCurrency(discountAmt, shop.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Total Tax</span>
            <span>{formatCurrency(order.taxTotal, shop.currency)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-black pt-1.5 text-base font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(finalTotal, shop.currency)}</span>
          </div>
          {order.paymentMethod && (
            <div className="flex justify-between text-gray-600">
              <span>{isPaid ? "Paid" : "Amount Received"}</span>
              <span>{formatCurrency(paidAmount, shop.currency)}</span>
            </div>
          )}
          {balance > 0 && (
            <div className="flex justify-between font-semibold" style={{ color: "#92400e" }}>
              <span>Balance Due</span>
              <span>{formatCurrency(balance, shop.currency)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 border-t border-gray-300 pt-3 text-[10px] text-gray-500" style={{ pageBreakInside: "avoid" }}>
        <p className="font-semibold text-gray-700">Terms &amp; Conditions</p>
        <p>Goods once sold are not returnable. All disputes subject to local jurisdiction.</p>
      </div>

      <div className="mt-10 flex justify-end" style={{ pageBreakInside: "avoid" }}>
        <div className="w-56 text-center">
          <div className="border-t border-gray-400 pt-1 text-xs text-gray-600">Authorized Signature</div>
        </div>
      </div>
    </div>
  );
}
