import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { PAYMENT_LABELS, PAYMENT_BADGE_CLASS, paymentMethodLabel, type PaymentStatus } from "@/lib/order-status";

export function PaymentDetailsCard({
  paymentStatus,
  paymentMethod,
  paidAmount,
  amountDue,
  currency,
}: {
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paidAmount: number | null;
  amountDue: number;
  currency: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b bg-muted/30">
        <CreditCard className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Details</p>
      </div>
      <div className="px-4 py-1.5 sm:px-5">
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-sm text-muted-foreground">Status</span>
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", PAYMENT_BADGE_CLASS[paymentStatus])}>
            {PAYMENT_LABELS[paymentStatus]}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-sm text-muted-foreground">Method</span>
          <span className="text-sm font-medium">{paymentMethod ? paymentMethodLabel(paymentMethod) : "Pending"}</span>
        </div>
        {(paymentStatus === "PENDING" || paymentStatus === "PARTIALLY_PAID") && (
          <div className="mt-1.5 space-y-1 border-t pt-1.5">
            {paymentStatus === "PARTIALLY_PAID" && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Paid Amount</span>
                <span className="font-medium text-foreground">{formatCurrency(paidAmount ?? 0, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{paymentStatus === "PARTIALLY_PAID" ? "Remaining" : "Amount Due"}</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(amountDue, currency)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
