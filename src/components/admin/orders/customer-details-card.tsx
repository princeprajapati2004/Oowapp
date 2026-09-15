import { User, Truck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

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
 * as a separate section. Courier/tracking rows follow the same "extra rows
 * for a Delivery order" convention rather than becoming a third card.
 */
export function CustomerDetailsCard({
  customerName,
  customerPhone,
  orderType,
  tableNumber,
  deliveryAddress,
  courierName,
  trackingNumber,
  trackingUrl,
  onEditDelivery,
}: {
  customerName: string | null;
  customerPhone: string | null;
  orderType: "Delivery" | "Dine-in" | "Takeaway";
  tableNumber: string | null;
  deliveryAddress: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  // Omitted entirely for the customer-facing reuse of this card (if any) —
  // only the Owner/staff view can edit tracking info.
  onEditDelivery?: () => void;
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

      {orderType === "Delivery" && (
        <div className="border-t px-4 py-2.5 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Truck className="size-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Delivery Tracking
              </p>
            </div>
            {onEditDelivery && (
              <Button variant="ghost" size="icon-xs" onClick={onEditDelivery} aria-label="Edit delivery tracking">
                <Pencil className="size-3.5" />
              </Button>
            )}
          </div>
          {courierName || trackingNumber || trackingUrl ? (
            <div className="mt-1">
              {courierName && <Row label="Courier" value={courierName} />}
              {trackingNumber && <Row label="Tracking #" value={trackingNumber} />}
              {trackingUrl && (
                <div className="flex items-center justify-between gap-3 py-1">
                  <span className="text-sm text-muted-foreground">Link</span>
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-right text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Track shipment
                  </a>
                </div>
              )}
              <p className="pb-1 text-[11px] text-muted-foreground/80">Entered manually — not a live courier feed.</p>
            </div>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">No tracking details added yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
