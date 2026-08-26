import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
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
import { ORDER_RETURN_BADGE_LABELS, ORDER_RETURN_BADGE_CLASS } from "@/lib/return-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";

// Compact summary only — full item list, billing breakdown, payment
// transaction detail, address, and notes all live one tap away in Order
// Detail (order-detail-page.tsx), not here.
export function OrderCard({
  order,
  currency,
}: {
  order: AdminOrderEventOrder;
  currency: string;
}) {
  const status = order.status as OrderStatus;
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const total = order.discountedTotal ?? order.grandTotal;
  const { date, dayTime } = formatOrderDateParts(order.createdAt);
  const orderType = deriveOrderType(order);

  return (
    <Link
      href={`/admin/orders/${order.id}`}
      className="block w-full text-left rounded-xl border bg-card px-4 py-3.5 hover:bg-muted/40 hover:border-border transition-colors"
    >
      <p className="font-mono text-sm font-semibold">{order.billNumber}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{date}</p>
      <p className="text-xs text-muted-foreground">{dayTime}</p>
      {orderType === "Dine-in" && order.tableNumber && (
        <p className="mt-1 text-xs font-medium text-foreground">Table {order.tableNumber}</p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{order.customerName || "Walk-in Customer"}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="whitespace-nowrap text-sm font-semibold">{formatCurrency(total, currency)}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </div>

      <div className="my-2.5 border-t" />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[11px]">
            {deriveOrderSource(order)}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            {orderType}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${PAYMENT_BADGE_CLASS[paymentStatus]}`}>
            {PAYMENT_LABELS[paymentStatus]}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
          {order.returnBadge && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${ORDER_RETURN_BADGE_CLASS[order.returnBadge]}`}>
              {ORDER_RETURN_BADGE_LABELS[order.returnBadge]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
