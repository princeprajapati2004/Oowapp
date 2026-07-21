import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/date";
import type { SubscriptionSummary } from "@/lib/services/subscription";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  TRIAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  EXPIRING_SOON: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  EXPIRED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  TRIAL: "Trial",
  EXPIRING_SOON: "Expiring Soon",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

// Only the expiry-warning block is conditional (daysRemaining <= 7) — the
// plan/status/expiry/days-remaining info above it is always visible per spec
// ("Business owner dashboard ... only show Current Plan, Subscription Status,
// Expiry Date, Days Remaining").
export function SubscriptionCard({ subscription }: { subscription: SubscriptionSummary }) {
  const { planName, status, endDate, daysRemaining, showExpiryWarning } = subscription;
  const remainingDisplay = daysRemaining === null ? null : Math.max(daysRemaining, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Subscription</CardTitle>
          <span
            className={`inline-block shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
              STATUS_STYLES[status] ?? STATUS_STYLES.CANCELLED
            }`}
          >
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>
        <CardDescription>{planName} plan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Expiry date</span>
          <span className="font-medium">{endDate ? formatDate(endDate) : "—"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Days remaining</span>
          <span className="font-medium tabular-nums">{remainingDisplay ?? "—"}</span>
        </div>

        {showExpiryWarning && remainingDisplay !== null && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <p>
              Subscription expires{" "}
              {remainingDisplay === 0
                ? "today"
                : `in ${remainingDisplay} day${remainingDisplay === 1 ? "" : "s"}`}
              . Please contact support to renew your subscription.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
