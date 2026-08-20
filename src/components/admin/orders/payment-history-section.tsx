import { History } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { paymentMethodLabel } from "@/lib/order-status";
import type { PaymentRecordPayload } from "@/lib/server/order-events";

/**
 * Individual payment transactions for this order — distinct from the single
 * cumulative Order.paidAmount used everywhere else for status logic. Shows
 * how a bill was actually settled (e.g. ₹300 cash then ₹700 UPI) rather than
 * just the final total. Hidden entirely when there's nothing to show yet.
 */
export function PaymentHistorySection({ records, currency }: { records: PaymentRecordPayload[]; currency: string }) {
  if (records.length === 0) return null;

  const total = records.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 border-b bg-muted/30 px-4 py-2.5">
        <History className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment History</p>
      </div>
      <div className="divide-y">
        {records.map((record, i) => (
          <div key={record.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
            <div className="min-w-0">
              <p className="font-medium">
                Payment {i + 1} · {paymentMethodLabel(record.method)}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(record.createdAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {record.transactionReference && ` · Ref: ${record.transactionReference}`}
              </p>
              {record.note && <p className="text-xs text-muted-foreground">{record.note}</p>}
            </div>
            <span className="shrink-0 font-semibold">{formatCurrency(record.amount, currency)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5 text-sm font-bold sm:px-5">
        <span>Total Paid</span>
        <span className="text-primary">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}
