import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_BADGE_CLASS,
  RETURN_REASON_LABELS,
  deriveReturnNumber,
  type ReturnStatus,
  type ReturnReason,
} from "@/lib/return-status";
import type { ReturnEventPayload } from "@/lib/server/order-events";

export function ReturnCard({ returnRequest, currency }: { returnRequest: ReturnEventPayload; currency: string }) {
  const status = returnRequest.status as ReturnStatus;
  const reason = returnRequest.reason as ReturnReason;
  const { date, dayTime } = formatOrderDateParts(returnRequest.createdAt);
  const itemsSummary = returnRequest.items.map((i) => `${i.productName} × ${i.quantity}`).join(", ");

  return (
    <Link
      href={`/admin/returns/${returnRequest.id}`}
      className="block w-full text-left rounded-xl border bg-card px-4 py-3.5 hover:bg-muted/40 hover:border-border transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{deriveReturnNumber(returnRequest.id)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Order #{returnRequest.orderBillNumber}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{date} · {dayTime}</p>

      <p className="mt-2 truncate text-sm">{itemsSummary}</p>
      <p className="text-xs text-muted-foreground">
        {returnRequest.customerName || "Walk-in Customer"} · {RETURN_REASON_LABELS[reason]}
      </p>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${RETURN_STATUS_BADGE_CLASS[status]}`}
        >
          {RETURN_STATUS_LABELS[status]}
        </span>
        <span className="whitespace-nowrap text-sm font-semibold">
          {formatCurrency(returnRequest.requestedRefundAmount, currency)}
        </span>
      </div>
    </Link>
  );
}
