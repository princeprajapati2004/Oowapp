"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import { STATUS_STYLES, STATUS_LABELS } from "@/components/admin/subscription-card";
import type { SubscriptionSummary } from "@/lib/services/subscription";
import type { SubscriptionDuration } from "@/generated/prisma/client";

const DURATION_LABELS: Record<string, string> = {
  FIFTEEN_DAYS: "15 days",
  ONE_MONTH: "Monthly",
  THREE_MONTHS: "Quarterly",
  SIX_MONTHS: "Half-yearly",
  TWELVE_MONTHS: "Yearly",
  CUSTOM: "Custom",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore, copying is a convenience only
    }
  }

  return (
    <div>
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-0.5 flex items-center gap-1.5 font-mono text-xs font-medium text-foreground hover:text-primary"
        title="Copy"
      >
        <span className="truncate">{value}</span>
        {copied ? <Check className="size-3 shrink-0 text-emerald-600" /> : <Copy className="size-3 shrink-0 text-muted-foreground" />}
      </button>
    </div>
  );
}

export function SubscriptionBillingSection({
  subscription,
  duration,
  enabledFeatureLabels,
  accountId,
  businessId,
  registeredOn,
  lastLogin,
}: {
  subscription: SubscriptionSummary;
  duration: SubscriptionDuration;
  enabledFeatureLabels: string[];
  accountId: string;
  businessId: string;
  registeredOn: Date;
  lastLogin: Date | null;
}) {
  const { planCode, planName, status, startDate, endDate, daysRemaining, showExpiryWarning } = subscription;
  const remainingDisplay = daysRemaining === null ? null : Math.max(daysRemaining, 0);

  return (
    <div className="space-y-5">
      {/* Plan + status */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-heading text-lg font-semibold">{planName}</p>
          <p className="text-sm text-muted-foreground">Plan code: {planCode}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-2.5 py-1 text-xs font-medium",
            STATUS_STYLES[status] ?? STATUS_STYLES.CANCELLED
          )}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>

      {showExpiryWarning && remainingDisplay !== null && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Subscription expires {remainingDisplay === 0 ? "today" : `in ${remainingDisplay} day${remainingDisplay === 1 ? "" : "s"}`}.
            Please contact support to renew your subscription.
          </p>
        </div>
      )}

      {/* Subscription details */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <DetailRow label="Billing cycle" value={DURATION_LABELS[duration] ?? duration} />
        <DetailRow label="Plan start date" value={formatDate(startDate)} />
        <DetailRow label="Plan expiry date" value={endDate ? formatDate(endDate) : "—"} />
        <DetailRow label="Days remaining" value={remainingDisplay ?? "—"} />
      </div>

      {/* Included features */}
      <div>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Included in your plan</p>
        {enabledFeatureLabels.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {enabledFeatureLabels.map((label) => (
              <Badge key={label} variant="secondary" className="font-normal">
                {label}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">No add-on features enabled for this plan.</p>
        )}
      </div>

      <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
        Subscriptions on OowApp are managed directly by our team. To upgrade, renew, or make changes to your
        plan or billing, please contact your OowApp support contact.
      </div>

      <div className="border-t pt-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Account</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <CopyableId label="Account ID" value={accountId} />
          <CopyableId label="Business ID" value={businessId} />
          <DetailRow label="Registered on" value={formatDate(registeredOn)} />
          <DetailRow label="Last login" value={lastLogin ? formatDate(lastLogin) : "—"} />
        </div>
      </div>
    </div>
  );
}
