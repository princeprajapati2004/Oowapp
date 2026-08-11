import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PAYMENT_LABELS,
  PAYMENT_BADGE_CLASS,
  deriveOrderType,
  deriveOrderSource,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";

export function OrderCard({
  order,
  currency,
  onClick,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  onClick: () => void;
}) {
  const status = order.status as OrderStatus;
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const total = order.discountedTotal ?? order.grandTotal;
  const created = new Date(order.createdAt);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border bg-card px-4 py-3.5 hover:bg-muted/40 hover:border-border transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold">{order.billNumber}</span>
            <span className="text-xs text-muted-foreground">
              {created.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })},{" "}
              {created.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          <div className="text-sm">
            <p className="font-medium truncate">{order.customerName || "Walk-in Customer"}</p>
            {order.customerPhone ? (
              <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[11px]">
              {deriveOrderSource(order)}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {deriveOrderType(order)}
            </Badge>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${PAYMENT_BADGE_CLASS[paymentStatus]}`}>
              {PAYMENT_LABELS[paymentStatus]}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-semibold text-sm whitespace-nowrap">{formatCurrency(total, currency)}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </div>
    </button>
  );
}
