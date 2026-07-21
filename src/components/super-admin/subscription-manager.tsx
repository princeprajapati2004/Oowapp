"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/date";

type DisplayStatus = "TRIAL" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED" | "CANCELLED";

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

const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: "FIFTEEN_DAYS", label: "15 Days" },
  { value: "ONE_MONTH", label: "1 Month" },
  { value: "THREE_MONTHS", label: "3 Months" },
  { value: "SIX_MONTHS", label: "6 Months" },
  { value: "TWELVE_MONTHS", label: "12 Months" },
  { value: "CUSTOM", label: "Custom Duration" },
];

interface Plan {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface CurrentSubscription {
  planCode: string;
  planName: string;
  displayStatus: DisplayStatus;
  duration: string;
  startDate: string;
  endDate: string | null;
  daysRemaining: number | null;
  createdBy: string | null;
  remarks: string | null;
}

interface HistoryRow {
  id: string | null;
  planCode: string;
  planName: string;
  status: string;
  duration: string;
  action: string;
  startDate: string;
  endDate: string | null;
  createdBy: string | null;
  remarks: string | null;
  createdAt: string;
}

type ActionKind = "create" | "renew" | "extend" | "change_plan" | "suspend" | "resume" | "expire";

const ACTION_LABELS: Record<ActionKind, string> = {
  create: "Create Subscription",
  renew: "Renew Subscription",
  extend: "Extend Subscription",
  change_plan: "Change Plan",
  suspend: "Suspend Subscription",
  resume: "Resume Subscription",
  expire: "Expire Subscription",
};

export function SubscriptionManager({
  shopId,
  current,
  history,
  plans,
}: {
  shopId: string;
  current: CurrentSubscription;
  history: HistoryRow[];
  plans: Plan[];
}) {
  const router = useRouter();
  const remainingDisplay = current.daysRemaining === null ? null : Math.max(current.daysRemaining, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Subscription</CardTitle>
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                STATUS_STYLES[current.displayStatus] ?? STATUS_STYLES.CANCELLED
              }`}
            >
              {STATUS_LABELS[current.displayStatus] ?? current.displayStatus}
            </span>
          </div>
          <CardDescription>{current.planName} plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Row label="Start date" value={formatDate(current.startDate)} />
            <Row label="Expiry date" value={current.endDate ? formatDate(current.endDate) : "—"} />
            <Row label="Days remaining" value={remainingDisplay ?? "—"} />
          </div>
          {current.remarks && (
            <p className="text-xs text-muted-foreground">Last remark: {current.remarks}</p>
          )}

          {remainingDisplay !== null && remainingDisplay <= 7 && current.displayStatus !== "EXPIRED" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <p>Expires {remainingDisplay === 0 ? "today" : `in ${remainingDisplay} day(s)`}.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <SubscriptionActionDialog
              action="create"
              shopId={shopId}
              plans={plans}
              onDone={() => router.refresh()}
            />
            <SubscriptionActionDialog
              action="renew"
              shopId={shopId}
              plans={plans}
              onDone={() => router.refresh()}
            />
            <SubscriptionActionDialog
              action="extend"
              shopId={shopId}
              plans={plans}
              onDone={() => router.refresh()}
            />
            <SubscriptionActionDialog
              action="change_plan"
              shopId={shopId}
              plans={plans}
              onDone={() => router.refresh()}
            />
            {current.displayStatus === "SUSPENDED" ? (
              <SubscriptionActionDialog
                action="resume"
                shopId={shopId}
                plans={plans}
                onDone={() => router.refresh()}
              />
            ) : (
              <SubscriptionActionDialog
                action="suspend"
                shopId={shopId}
                plans={plans}
                onDone={() => router.refresh()}
              />
            )}
            <SubscriptionActionDialog
              action="expire"
              shopId={shopId}
              plans={plans}
              onDone={() => router.refresh()}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Subscription History</CardTitle>
          <CardDescription>Every subscription record ever created for this business.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No subscription history yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Plan</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Start</th>
                    <th className="px-3 py-2 text-left">End</th>
                    <th className="px-3 py-2 text-left">By</th>
                    <th className="px-3 py-2 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-3 py-2">{row.action}</td>
                      <td className="px-3 py-2">{row.planName}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDate(row.startDate)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {row.endDate ? formatDate(row.endDate) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">
                        {row.createdBy ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                        {row.remarks ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function SubscriptionActionDialog({
  action,
  shopId,
  plans,
  onDone,
}: {
  action: ActionKind;
  shopId: string;
  plans: Plan[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "");
  const [duration, setDuration] = useState("ONE_MONTH");
  const [endDate, setEndDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const needsPlan = action === "create" || action === "change_plan";
  const needsDuration = action === "create" || action === "renew" || action === "extend";
  const isDestructiveish = action === "suspend" || action === "expire";

  async function handleSubmit() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { action, remarks: remarks.trim() || undefined };
      if (needsPlan) body.planCode = planCode;
      if (needsDuration) {
        body.duration = duration;
        if (duration === "CUSTOM") body.endDate = endDate;
      }
      await api.post(`/api/super-admin/businesses/${shopId}/subscription`, body);
      toast.success(`${ACTION_LABELS[action]} complete.`);
      setOpen(false);
      setRemarks("");
      onDone();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={isDestructiveish ? "destructive" : "outline"} size="sm" />}>
        {ACTION_LABELS[action]}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ACTION_LABELS[action]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {needsPlan && (
            <Field>
              <FieldLabel>Plan</FieldLabel>
              <Select value={planCode} onValueChange={(v) => v && setPlanCode(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.code}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {needsDuration && (
            <Field>
              <FieldLabel>Duration</FieldLabel>
              <Select value={duration} onValueChange={(v) => v && setDuration(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {needsDuration && duration === "CUSTOM" && (
            <Field>
              <FieldLabel>End date</FieldLabel>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          )}
          <Field>
            <FieldLabel>Remarks (optional)</FieldLabel>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant={isDestructiveish ? "destructive" : "default"}
            disabled={saving || (needsDuration && duration === "CUSTOM" && !endDate)}
            onClick={handleSubmit}
          >
            {saving ? "Working…" : ACTION_LABELS[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
