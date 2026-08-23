"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import type { listCashbackCampaigns } from "@/lib/services/cashback-campaign";
import type { serializeCashbackCampaigns } from "@/lib/serialize";

type CampaignRow = ReturnType<
  typeof serializeCashbackCampaigns<Awaited<ReturnType<typeof listCashbackCampaigns>>[number]>
>[number];

type FilterTab = "ALL" | "ACTIVE" | "EXPIRED" | "DISABLED";

const EMPTY_FORM = {
  code: "",
  description: "",
  rewardType: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
  rewardValue: "",
  maxCashbackAmount: "",
  minOrderAmount: "",
  totalUsageLimit: "",
  perCustomerLimit: "",
  startsAt: "",
  expiresAt: "",
  isEnabled: true,
};

function toDateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function campaignStatus(campaign: CampaignRow): "ACTIVE" | "EXPIRED" | "DISABLED" | "SCHEDULED" {
  if (!campaign.isEnabled) return "DISABLED";
  const now = Date.now();
  if (campaign.expiresAt && new Date(campaign.expiresAt).getTime() < now) return "EXPIRED";
  if (campaign.startsAt && new Date(campaign.startsAt).getTime() > now) return "SCHEDULED";
  return "ACTIVE";
}

export function CashbackManager({
  initialCampaigns,
  currency,
}: {
  initialCampaigns: CampaignRow[];
  currency: string;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CampaignRow | null>(null);

  const filtered = useMemo(() => {
    if (filter === "ALL") return campaigns;
    if (filter === "DISABLED") return campaigns.filter((c) => campaignStatus(c) === "DISABLED");
    if (filter === "EXPIRED") return campaigns.filter((c) => campaignStatus(c) === "EXPIRED");
    return campaigns.filter((c) => campaignStatus(c) === "ACTIVE" || campaignStatus(c) === "SCHEDULED");
  }, [campaigns, filter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(campaign: CampaignRow) {
    setEditing(campaign);
    setForm({
      code: campaign.code,
      description: campaign.description ?? "",
      rewardType: campaign.rewardType,
      rewardValue: String(campaign.rewardValue),
      maxCashbackAmount: campaign.maxCashbackAmount != null ? String(campaign.maxCashbackAmount) : "",
      minOrderAmount: campaign.minOrderAmount != null ? String(campaign.minOrderAmount) : "",
      totalUsageLimit: campaign.totalUsageLimit != null ? String(campaign.totalUsageLimit) : "",
      perCustomerLimit: campaign.perCustomerLimit != null ? String(campaign.perCustomerLimit) : "",
      startsAt: toDateInputValue(campaign.startsAt),
      expiresAt: toDateInputValue(campaign.expiresAt),
      isEnabled: campaign.isEnabled,
    });
    setDialogOpen(true);
  }

  function buildPayload() {
    const rewardValueNum = Number(form.rewardValue);
    if (!form.code.trim()) return null;
    if (!Number.isFinite(rewardValueNum) || rewardValueNum <= 0) return null;
    return {
      code: form.code,
      description: form.description || undefined,
      rewardType: form.rewardType,
      rewardValue: rewardValueNum,
      maxCashbackAmount: form.maxCashbackAmount ? Number(form.maxCashbackAmount) : null,
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
      totalUsageLimit: form.totalUsageLimit ? Number(form.totalUsageLimit) : null,
      perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
      startsAt: form.startsAt || null,
      expiresAt: form.expiresAt || null,
      isEnabled: form.isEnabled,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    if (!payload) return toast.error("Enter a code and a valid reward value");

    setSaving(true);
    try {
      if (editing) {
        const updated = await api.patch<CampaignRow>(`/api/admin/cashback-campaigns/${editing.id}`, payload);
        setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success("Cashback campaign updated");
      } else {
        const created = await api.post<CampaignRow>("/api/admin/cashback-campaigns", payload);
        setCampaigns((prev) => [created, ...prev]);
        toast.success("Cashback campaign created");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/cashback-campaigns/${deleteTarget.id}`);
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success("Campaign deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleToggleEnabled(campaign: CampaignRow) {
    try {
      const updated = await api.patch<CampaignRow>(`/api/admin/cashback-campaigns/${campaign.id}`, {
        code: campaign.code,
        description: campaign.description ?? undefined,
        rewardType: campaign.rewardType,
        rewardValue: campaign.rewardValue,
        maxCashbackAmount: campaign.maxCashbackAmount,
        minOrderAmount: campaign.minOrderAmount,
        totalUsageLimit: campaign.totalUsageLimit,
        perCustomerLimit: campaign.perCustomerLimit,
        startsAt: campaign.startsAt,
        expiresAt: campaign.expiresAt,
        isEnabled: !campaign.isEnabled,
      });
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cashback</h1>
          <p className="text-muted-foreground">
            Codes that reward customers with wallet credit once their order is paid.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add campaign
        </Button>
      </div>

      {campaigns.length > 0 && (
        <Tabs value={filter} onValueChange={(v) => setFilter((v as FilterTab) ?? "ALL")}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="ACTIVE">Active</TabsTrigger>
            <TabsTrigger value="EXPIRED">Expired</TabsTrigger>
            <TabsTrigger value="DISABLED">Disabled</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No cashback campaigns yet"
          description="Create a code that rewards customers with wallet credit once their order is paid."
          action={<Button onClick={openCreate}>Add campaign</Button>}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">No campaigns in this filter.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {filtered.map((campaign) => {
            const status = campaignStatus(campaign);
            return (
              <div key={campaign.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono font-semibold text-sm">{campaign.code}</p>
                    <Badge variant="secondary" className="text-xs">
                      {campaign.rewardType === "PERCENTAGE"
                        ? `${campaign.rewardValue}% cashback`
                        : `${formatCurrency(campaign.rewardValue, currency)} cashback`}
                    </Badge>
                    {status === "EXPIRED" && <Badge variant="outline" className="text-xs">Expired</Badge>}
                    {status === "SCHEDULED" && <Badge variant="outline" className="text-xs">Scheduled</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {campaign.minOrderAmount != null ? `Min order ${formatCurrency(campaign.minOrderAmount, currency)} · ` : ""}
                    {campaign.usageCount} used
                    {campaign.totalUsageLimit != null ? ` / ${campaign.totalUsageLimit}` : ""}
                    {campaign.perCustomerLimit != null ? ` · ${campaign.perCustomerLimit} per customer` : ""}
                  </p>
                </div>
                <Switch checked={campaign.isEnabled} onCheckedChange={() => handleToggleEnabled(campaign)} aria-label="Enable/disable campaign" />
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(campaign)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(campaign)} aria-label="Delete" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit cashback campaign" : "Add cashback campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Code" htmlFor="cashback-code" required>
                <Input
                  id="cashback-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. CASHBACK10"
                  autoFocus
                />
              </FormRow>
              <FormRow label="Description" htmlFor="cashback-description">
                <Input
                  id="cashback-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Shown to you only"
                />
              </FormRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Reward type" htmlFor="cashback-type">
                <Select
                  value={form.rewardType}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, rewardType: v as typeof f.rewardType }))}
                >
                  <SelectTrigger id="cashback-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    <SelectItem value="FIXED">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Reward value" htmlFor="cashback-value" required>
                <Input
                  id="cashback-value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.rewardValue}
                  onChange={(e) => setForm((f) => ({ ...f, rewardValue: e.target.value }))}
                />
              </FormRow>
            </div>

            {form.rewardType === "PERCENTAGE" && (
              <FormRow label="Maximum cashback amount" htmlFor="cashback-max" description="Caps the percentage reward — leave blank for no cap">
                <Input
                  id="cashback-max"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.maxCashbackAmount}
                  onChange={(e) => setForm((f) => ({ ...f, maxCashbackAmount: e.target.value }))}
                />
              </FormRow>
            )}

            <FormRow label="Minimum order amount" htmlFor="cashback-min-order" description="Leave blank for no minimum">
              <Input
                id="cashback-min-order"
                type="number"
                min={0}
                step="0.01"
                value={form.minOrderAmount}
                onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
              />
            </FormRow>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Total usage limit" htmlFor="cashback-total-limit" description="Across all customers">
                <Input
                  id="cashback-total-limit"
                  type="number"
                  min={1}
                  value={form.totalUsageLimit}
                  onChange={(e) => setForm((f) => ({ ...f, totalUsageLimit: e.target.value }))}
                  placeholder="Unlimited"
                />
              </FormRow>
              <FormRow label="Per-customer limit" htmlFor="cashback-customer-limit" description="Always requires login">
                <Input
                  id="cashback-customer-limit"
                  type="number"
                  min={1}
                  value={form.perCustomerLimit}
                  onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))}
                  placeholder="Unlimited"
                />
              </FormRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Starts on" htmlFor="cashback-starts">
                <Input
                  id="cashback-starts"
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Expires on" htmlFor="cashback-expires">
                <Input
                  id="cashback-expires"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </FormRow>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium select-none">Enabled</p>
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete campaign?"
        description={`"${deleteTarget?.code}" will no longer be usable at checkout.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
