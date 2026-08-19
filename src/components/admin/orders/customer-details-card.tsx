import { User } from "lucide-react";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * Customer + fulfillment details in one card — table/delivery info used to
 * live in its own card, but the reference design folds it into Customer
 * Details as extra rows (brief §6), so it's merged here rather than kept
 * as a separate section.
 */
export function CustomerDetailsCard({
  customerName,
  customerPhone,
  orderType,
  tableNumber,
  deliveryAddress,
}: {
  customerName: string | null;
  customerPhone: string | null;
  orderType: "Delivery" | "Dine-in" | "Takeaway";
  tableNumber: string | null;
  deliveryAddress: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b bg-muted/30">
        <User className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer Details</p>
      </div>
      <div className="px-4 py-1.5 sm:px-5">
        <Row label="Name" value={customerName || "Walk-in Customer"} />
        {customerPhone && <Row label="Phone" value={customerPhone} />}
        <Row label="Order Type" value={orderType} />
        {orderType === "Dine-in" && tableNumber && <Row label="Table" value={`Table ${tableNumber}`} />}
        {orderType === "Delivery" && deliveryAddress && <Row label="Address" value={deliveryAddress} />}
      </div>
    </div>
  );
}
