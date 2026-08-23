"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Users, Clock, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";

type ReferralConfig = {
  isEnabled: boolean;
  rewardAmount: number;
  minQualifyingOrderAmount: number | null;
  qualifyingOrderScope: "FIRST_ORDER" | "ANY_ORDER";
};

type ReferralRow = {
  id: string;
  referrerName: string;
  referrerPhone: string;
  referrerCode: string | null;
  referredName: string;
  referredPhone: string;
  status: "PENDING" | "REWARDED";
  rewardAmount: number | null;
  createdAt: string;
  rewardedAt: string | null;
  qualifyingOrderId: string | null;
};

const STATUS_LABELS: Record<string, string> = { PENDING: "Pending", REWARDED: "Rewarded" };
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  REWARDED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const EMPTY_CONFIG: ReferralConfig = {
  isEnabled: false,
  rewardAmount: 0,
  minQualifyingOrderAmount: null,
  qualifyingOrderScope: "FIRST_ORDER",
};

export function ReferralManager({
  initialConfig,
  initialReferrals,
  currency,
}: {
  initialConfig: ReferralConfig | null;
  initialReferrals: ReferralRow[];
  currency: string;
}) {
  const [config, setConfig] = useState<ReferralConfig>(initialConfig ?? EMPTY_CONFIG);
  const [form, setForm] = useState({
    isEnabled: config.isEnabled,
    rewardAmount: config.rewardAmount ? String(config.rewardAmount) : "",
    minQualifyingOrderAmount: config.minQualifyingOrderAmount != null ? String(config.minQualifyingOrderAmount) : "",
    qualifyingOrderScope: config.qualifyingOrderScope,
  });
  const [saving, setSaving] = useState(false);
  const [referrals] = useState(initialReferrals);

  const stats = useMemo(() => {
    const total = referrals.length;
    const pending = referrals.filter((r) => r.status === "PENDING").length;
    const rewarded = referrals.filter((r) => r.status === "REWARDED").length;
    const totalCredited = referrals.reduce((sum, r) => sum + (r.status === "REWARDED" ? (r.rewardAmount ?? 0) : 0), 0);
    return { total, pending, rewarded, totalCredited };
  }, [referrals]);

  async function handleSave() {
    const rewardAmountNum = Number(form.rewardAmount);
    if (!Number.isFinite(rewardAmountNum) || rewardAmountNum <= 0) {
      toast.error("Enter a valid reward amount");
      return;
    }

    setSaving(true);
    try {
      const updated = await api.patch<ReferralConfig>("/api/admin/referral-config", {
        isEnabled: form.isEnabled,
        rewardAmount: rewardAmountNum,
        minQualifyingOrderAmount: form.minQualifyingOrderAmount ? Number(form.minQualifyingOrderAmount) : null,
        qualifyingOrderScope: form.qualifyingOrderScope,
      });
      setConfig(updated);
      toast.success("Referral settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-muted-foreground">
          Let customers refer friends and earn wallet credit when they place a qualifying order.
        </p>
      </div>

      {/* Settings */}
      <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Refer & Earn program</p>
            <p className="text-xs text-muted-foreground">
              {config.isEnabled ? "Enabled — customers can refer friends" : "Disabled — no referral rewards will be issued"}
            </p>
          </div>
          <Switch checked={form.isEnabled} onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormRow label="Reward amount" htmlFor="referral-reward" required description="Wallet credit given to the referrer">
            <Input
              id="referral-reward"
              type="number"
              min={0}
              step="0.01"
              value={form.rewardAmount}
              onChange={(e) => setForm((f) => ({ ...f, rewardAmount: e.target.value }))}
            />
          </FormRow>
          <FormRow label="Minimum qualifying order amount" htmlFor="referral-min-order" description="Leave blank for no minimum">
            <Input
              id="referral-min-order"
              type="number"
              min={0}
              step="0.01"
              value={form.minQualifyingOrderAmount}
              onChange={(e) => setForm((f) => ({ ...f, minQualifyingOrderAmount: e.target.value }))}
            />
          </FormRow>
        </div>

        <FormRow
          label="Qualifying order"
          htmlFor="referral-scope"
          description="Which paid order by the referred customer triggers the reward"
        >
          <Select
            value={form.qualifyingOrderScope}
            onValueChange={(v) => v && setForm((f) => ({ ...f, qualifyingOrderScope: v as typeof f.qualifyingOrderScope }))}
          >
            <SelectTrigger id="referral-scope" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FIRST_ORDER">Their first paid order only</SelectItem>
              <SelectItem value="ANY_ORDER">Any paid order</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <Users className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Total referrals</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <Clock className="size-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold">{stats.pending}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Rewarded</p>
            <p className="text-lg font-bold">{stats.rewarded}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <Wallet className="size-5 text-primary shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Total credited</p>
            <p className="text-lg font-bold">{formatCurrency(stats.totalCredited, currency)}</p>
          </div>
        </div>
      </div>

      {/* Referral list */}
      {referrals.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No referrals yet"
          description="Once customers start sharing their referral link, they'll show up here."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Referrer</th>
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Referred</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Reward</th>
                <th className="px-4 py-2.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {referrals.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.referrerName}</p>
                    <p className="text-xs text-muted-foreground">{r.referrerPhone}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs">{r.referrerCode ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.referredName}</p>
                    <p className="text-xs text-muted-foreground">{r.referredPhone}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge className={STATUS_COLORS[r.status]} variant="secondary">
                      {STATUS_LABELS[r.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    {r.rewardAmount != null ? formatCurrency(r.rewardAmount, currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
