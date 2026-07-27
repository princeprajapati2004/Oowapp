"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

// Displays a full-length ID (a raw cuid, ~25 chars) without breaking its
// layout: the value is truncated with an ellipsis on a single line, the full
// value shows in a tooltip on hover, and tapping it (touch has no hover)
// opens a small dialog with the full value plus its own copy button — the
// same "reveal on demand" pattern Stripe/AWS/Firebase use for long IDs.
function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied successfully.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — clipboard access was blocked.");
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="min-w-0 flex-1 truncate rounded text-left font-mono text-xs font-medium text-foreground hover:text-primary"
          >
            {value}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="font-mono">
            {value}
          </TooltipContent>
        </Tooltip>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          title="Copy"
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        </button>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <p className="rounded-lg bg-muted px-3 py-2.5 font-mono text-sm break-all">{value}</p>
          <Button onClick={handleCopy} className="w-full">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
        </DialogContent>
      </Dialog>
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
        {/* IDs get their own row with real room to breathe — squeezing a
            ~25-char cuid into the same narrow track as a short date is what
            caused the overflow this section previously had. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CopyableId label="Account ID" value={accountId} />
          <CopyableId label="Business ID" value={businessId} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DetailRow label="Registered on" value={formatDate(registeredOn)} />
          <DetailRow label="Last login" value={lastLogin ? formatDate(lastLogin) : "—"} />
        </div>
      </div>
    </div>
  );
}
