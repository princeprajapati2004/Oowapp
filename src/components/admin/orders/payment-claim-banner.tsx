import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { paymentMethodLabel } from "@/lib/order-status";

/**
 * Customer said "I've paid" (cash or UPI) on their own order-tracking page —
 * this surfaces that claim so the owner can Approve (records the real
 * payment via the existing mark_paid action) or Reject it (customer sees
 * "Payment Failed — Try Again"). The claim alone never marks the order paid;
 * only an explicit owner decision does (brief: never trust the frontend).
 */
export function PaymentClaimBanner({
  method,
  claimedAt,
  amount,
  currency,
  busy,
  onApprove,
  onReject,
}: {
  method: string | null;
  claimedAt: string | null;
  amount: number;
  currency: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const time = claimedAt ? new Date(claimedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex items-start gap-2.5 px-4 py-3">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
            Customer claims payment of {formatCurrency(amount, currency)} via {paymentMethodLabel(method)}
          </p>
          {time && <p className="text-xs text-amber-700/80 dark:text-amber-400/80">Claimed at {time} — please verify before approving.</p>}
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <Button
          className="h-9 flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={busy}
          onClick={onApprove}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Approve
        </Button>
        <Button variant="outline" className="h-9 flex-1" disabled={busy} onClick={onReject}>
          Reject
        </Button>
      </div>
    </div>
  );
}
