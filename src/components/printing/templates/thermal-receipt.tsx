import Image from "next/image";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { PAYMENT_LABELS, paymentMethodLabel, STATUS_LABELS } from "@/lib/order-status";
import { deriveBillFigures } from "@/lib/utils/bill-figures";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

function Divider() {
  return <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Shared by both thermal widths — the 58mm/80mm difference (section 4 vs 5
// of the print spec) is information density, not a different design, so one
// parametrized component avoids duplicating this markup twice.
export function ThermalReceipt({
  order,
  shop,
  width,
}: {
  order: BillOrderData;
  shop: BillShopData;
  width: "58" | "80";
}) {
  const wide = width === "80";
  const { date, dayTime } = formatOrderDateParts(order.createdAt);
  const { finalTotal, discountAmt, orderType, isPaid, paidAmount, balance } = deriveBillFigures(order);
  const fontSize = wide ? 11.5 : 10;

  return (
    <div
      style={{
        width: wide ? "80mm" : "58mm",
        padding: wide ? "3mm" : "2mm",
        fontFamily: "'Courier New', ui-monospace, monospace",
        fontSize,
        lineHeight: 1.35,
        color: "#000",
        backgroundColor: "#fff",
        wordBreak: "break-word",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        {wide && shop.logoUrl && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <Image src={shop.logoUrl} alt="" width={40} height={40} unoptimized style={{ borderRadius: 4, objectFit: "cover" }} />
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: fontSize + 2 }}>{shop.businessName}</div>
        {shop.address && <div>{shop.address}</div>}
        {shop.phone && <div>Ph: {shop.phone}</div>}
        {shop.gstNumber && <div>GSTIN: {shop.gstNumber}</div>}
      </div>

      <Divider />

      <Row label="Bill No" value={order.billNumber} />
      <Row label="Date" value={date} />
      <Row label="Time" value={dayTime.split(" • ")[1] ?? ""} />
      {order.customerName && <Row label="Customer" value={order.customerName} />}
      {wide && order.tableNumber && shop.enableTableNumber && <Row label="Table" value={order.tableNumber} />}
      <Row label="Order Type" value={orderType} />

      <Divider />

      {/* Items */}
      {wide && (
        <div style={{ display: "flex", fontWeight: 700, fontSize: fontSize - 1 }}>
          <span style={{ flex: "2.2 1 0", minWidth: 0 }}>ITEM</span>
          <span style={{ flex: "0.6 0 auto", textAlign: "center" }}>QTY</span>
          <span style={{ flex: "1.1 0 auto", textAlign: "right" }}>RATE</span>
          <span style={{ flex: "1.3 0 auto", textAlign: "right" }}>AMOUNT</span>
        </div>
      )}
      {wide && <Divider />}
      {order.items.map((item) => (
        <div key={item.id} style={{ marginBottom: 2 }}>
          {wide ? (
            <div style={{ display: "flex" }}>
              <span style={{ flex: "2.2 1 0", minWidth: 0, wordBreak: "break-word" }}>{item.name}</span>
              <span style={{ flex: "0.6 0 auto", textAlign: "center" }}>{item.quantity}</span>
              <span style={{ flex: "1.1 0 auto", textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(item.price, shop.currency)}</span>
              <span style={{ flex: "1.3 0 auto", textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(item.lineTotal, shop.currency)}</span>
            </div>
          ) : (
            <>
              <div>{item.name}</div>
              <Row
                label={`${item.quantity} x ${formatCurrency(item.price, shop.currency)}`}
                value={formatCurrency(item.lineTotal, shop.currency)}
              />
            </>
          )}
        </div>
      ))}

      <Divider />

      <Row label="Subtotal" value={formatCurrency(order.subtotal, shop.currency)} />
      {discountAmt > 0 && <Row label="Discount" value={`-${formatCurrency(discountAmt, shop.currency)}`} />}
      {order.taxBreakdown.map((line) => (
        <Row key={line.id} label={line.name} value={formatCurrency(line.amount, shop.currency)} />
      ))}
      <Divider />
      <Row label="Grand Total" value={formatCurrency(finalTotal, shop.currency)} bold />
      {order.paymentMethod && (
        <>
          <Row label="Paid" value={formatCurrency(paidAmount, shop.currency)} />
          {balance > 0 && <Row label="Balance" value={formatCurrency(balance, shop.currency)} />}
        </>
      )}

      <Divider />

      {order.paymentMethod && <Row label="Payment Method" value={paymentMethodLabel(order.paymentMethod)} />}
      <Row label="Payment Status" value={isPaid ? PAYMENT_LABELS.PAID : (PAYMENT_LABELS[(order.paymentStatus as keyof typeof PAYMENT_LABELS) ?? "PENDING"] ?? "Unpaid")} />
      {wide && order.transactionReference && <Row label="Txn Ref" value={order.transactionReference} />}
      {wide && <Row label="Order Status" value={STATUS_LABELS[order.status]} />}

      <Divider />

      <div style={{ textAlign: "center", fontWeight: 700 }}>Thank You!</div>
    </div>
  );
}
