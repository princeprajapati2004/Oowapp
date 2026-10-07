"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Settings2, Sliders, Copy, Archive } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";

const LIMIT_KEYS = ["BUSINESSES", "USERS", "PRODUCTS", "GODOWNS", "STORAGE_MB", "MONTHLY_ORDERS", "CUSTOMERS", "INVOICES"] as const;
type LimitKey = (typeof LIMIT_KEYS)[number];
const LIMIT_LABELS: Record<LimitKey, string> = {
  BUSINESSES: "Businesses",
  USERS: "Users",
  PRODUCTS: "Products",
  GODOWNS: "Godowns",
  STORAGE_MB: "Storage (MB)",
  MONTHLY_ORDERS: "Monthly Orders",
  CUSTOMERS: "Customers",
  INVOICES: "Invoices",
};

interface Feature {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
}

interface PlanFeatureRow {
  featureId: string;
  enabled: boolean;
  feature: Feature;
}

interface PlanLimitRow {
  limitKey: LimitKey;
  limitValue: number | null;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  sortOrder: number;
  monthlyPrice: string | number | null;
  annualPrice: string | number | null;
  currency: string;
  isPopular: boolean;
  trialDays: number;
  planFeatures: PlanFeatureRow[];
  planLimits: PlanLimitRow[];
}

function formatPrice(value: string | number | null, currency: string): string {
  if (value === null) return "—";
  return `${currency} ${Number(value).toLocaleString()}`;
}

export function PlanManager({ plans, features }: { plans: Plan[]; features: Feature[] }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Pricing, limits, and default feature entitlements. Per-business overrides live on
            each business&apos;s Subscription tab.
          </p>
        </div>
        <NewPlanDialog onCreated={() => router.refresh()} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} features={features} onChanged={() => router.refresh()} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 pt-4">
        <div>
          <h2 className="text-lg font-semibold">Features</h2>
          <p className="text-sm text-muted-foreground">The full catalog of gatable premium features.</p>
        </div>
        <NewFeatureDialog onCreated={() => router.refresh()} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {features.map((feature) => (
              <div key={feature.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{feature.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {feature.key}
                    {feature.category ? ` · ${feature.category}` : ""}
                  </p>
                  {feature.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                  )}
                </div>
                {!feature.isActive && <Badge variant="outline">Inactive</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanCard({
  plan,
  features,
  onChanged,
}: {
  plan: Plan;
  features: Feature[];
  onChanged: () => void;
}) {
  const enabledByFeatureId = new Map(plan.planFeatures.map((pf) => [pf.featureId, pf.enabled]));
  const enabledCount = plan.planFeatures.filter((pf) => pf.enabled).length;
  const limitByKey = new Map(plan.planLimits.map((pl) => [pl.limitKey, pl.limitValue]));

  return (
    <Card className={plan.isArchived ? "opacity-60" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {plan.name}
            {plan.isPopular && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Most Popular</Badge>}
          </CardTitle>
          <div className="flex gap-1">
            {plan.isArchived && <Badge variant="outline">Archived</Badge>}
            {!plan.isArchived && !plan.isActive && <Badge variant="outline">Disabled</Badge>}
          </div>
        </div>
        <CardDescription>{plan.description || plan.code}</CardDescription>
        <div className="flex gap-3 text-sm pt-1">
          <span><span className="font-medium">{formatPrice(plan.monthlyPrice, plan.currency)}</span>/mo</span>
          <span className="text-muted-foreground">·</span>
          <span><span className="font-medium">{formatPrice(plan.annualPrice, plan.currency)}</span>/yr</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {enabledCount} of {features.length} features enabled by default · {plan.trialDays}-day trial
        </p>
        <div className="flex flex-wrap gap-2">
          <EditPlanDialog plan={plan} onSaved={onChanged} />
          <ManageFeaturesDialog
            plan={plan}
            features={features}
            enabledByFeatureId={enabledByFeatureId}
            onSaved={onChanged}
          />
          <ManageLimitsDialog plan={plan} limitByKey={limitByKey} onSaved={onChanged} />
          <DuplicatePlanDialog plan={plan} onDuplicated={onChanged} />
          {!plan.isArchived && <ArchivePlanButton plan={plan} onArchived={onChanged} />}
        </div>
      </CardContent>
    </Card>
  );
}

function PricingFields({
  monthlyPrice,
  setMonthlyPrice,
  annualPrice,
  setAnnualPrice,
  currency,
  setCurrency,
  isPopular,
  setIsPopular,
  trialDays,
  setTrialDays,
}: {
  monthlyPrice: string;
  setMonthlyPrice: (v: string) => void;
  annualPrice: string;
  setAnnualPrice: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  isPopular: boolean;
  setIsPopular: (v: boolean) => void;
  trialDays: string;
  setTrialDays: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Monthly price</FieldLabel>
          <Input type="number" min="0" value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} placeholder="Leave blank = no self-service price" />
        </Field>
        <Field>
          <FieldLabel>Annual price</FieldLabel>
          <Input type="number" min="0" value={annualPrice} onChange={(e) => setAnnualPrice(e.target.value)} placeholder="Leave blank = Contact Sales" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Currency</FieldLabel>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </Field>
        <Field>
          <FieldLabel>Trial days</FieldLabel>
          <Input type="number" min="0" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
        </Field>
      </div>
      <Field orientation="horizontal">
        <FieldLabel>Most Popular badge</FieldLabel>
        <Switch checked={isPopular} onCheckedChange={setIsPopular} />
      </Field>
    </>
  );
}

function NewPlanDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [annualPrice, setAnnualPrice] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [isPopular, setIsPopular] = useState(false);
  const [trialDays, setTrialDays] = useState("15");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.post("/api/super-admin/plans", {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        monthlyPrice: monthlyPrice ? Number(monthlyPrice) : undefined,
        annualPrice: annualPrice ? Number(annualPrice) : undefined,
        currency: currency.trim() || "INR",
        isPopular,
        trialDays: trialDays ? Number(trialDays) : 15,
      });
      toast.success("Plan created.");
      setOpen(false);
      setCode("");
      setName("");
      setDescription("");
      setMonthlyPrice("");
      setAnnualPrice("");
      setIsPopular(false);
      onCreated();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to create plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        New Plan
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Plan</DialogTitle>
          <DialogDescription>Create a new subscription plan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field>
            <FieldLabel>Code</FieldLabel>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="MOON_STAR"
            />
          </Field>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Moon Star" />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <PricingFields
            monthlyPrice={monthlyPrice}
            setMonthlyPrice={setMonthlyPrice}
            annualPrice={annualPrice}
            setAnnualPrice={setAnnualPrice}
            currency={currency}
            setCurrency={setCurrency}
            isPopular={isPopular}
            setIsPopular={setIsPopular}
            trialDays={trialDays}
            setTrialDays={setTrialDays}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={!code.trim() || !name.trim() || saving}
            onClick={handleSubmit}
          >
            {saving ? "Creating…" : "Create Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPlanDialog({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [isActive, setIsActive] = useState(plan.isActive);
  const [monthlyPrice, setMonthlyPrice] = useState(plan.monthlyPrice !== null ? String(plan.monthlyPrice) : "");
  const [annualPrice, setAnnualPrice] = useState(plan.annualPrice !== null ? String(plan.annualPrice) : "");
  const [currency, setCurrency] = useState(plan.currency);
  const [isPopular, setIsPopular] = useState(plan.isPopular);
  const [trialDays, setTrialDays] = useState(String(plan.trialDays));
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.patch(`/api/super-admin/plans/${plan.id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
        isActive,
        monthlyPrice: monthlyPrice ? Number(monthlyPrice) : null,
        annualPrice: annualPrice ? Number(annualPrice) : null,
        currency: currency.trim() || "INR",
        isPopular,
        trialDays: trialDays ? Number(trialDays) : 15,
      });
      toast.success("Plan updated.");
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {plan.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <PricingFields
            monthlyPrice={monthlyPrice}
            setMonthlyPrice={setMonthlyPrice}
            annualPrice={annualPrice}
            setAnnualPrice={setAnnualPrice}
            currency={currency}
            setCurrency={setCurrency}
            isPopular={isPopular}
            setIsPopular={setIsPopular}
            trialDays={trialDays}
            setTrialDays={setTrialDays}
          />
          <Field orientation="horizontal">
            <FieldLabel>Active</FieldLabel>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || saving} onClick={handleSubmit}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageFeaturesDialog({
  plan,
  features,
  enabledByFeatureId,
  onSaved,
}: {
  plan: Plan;
  features: Feature[];
  enabledByFeatureId: Map<string, boolean>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Map<string, boolean>>(enabledByFeatureId);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.patch(`/api/super-admin/plans/${plan.id}/features`, {
        features: features.map((f) => ({
          featureId: f.id,
          enabled: state.get(f.id) ?? false,
        })),
      });
      toast.success("Feature defaults updated.");
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update features");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(new Map(enabledByFeatureId));
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Settings2 className="size-4" />
        Features
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan.name} — default features</DialogTitle>
          <DialogDescription>
            Applies to every business on this plan unless overridden individually.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {features.map((feature) => (
            <div key={feature.id} className="flex items-center justify-between gap-3 py-1.5">
              <div>
                <p className="text-sm font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground">{feature.key}</p>
              </div>
              <Switch
                checked={state.get(feature.id) ?? false}
                onCheckedChange={(checked) =>
                  setState((prev) => new Map(prev).set(feature.id, checked))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageLimitsDialog({
  plan,
  limitByKey,
  onSaved,
}: {
  plan: Plan;
  limitByKey: Map<LimitKey, number | null>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  // "" (unlimited) or a numeric string per limit key.
  const [state, setState] = useState<Record<LimitKey, string>>(() => toStateMap(limitByKey));
  const [saving, setSaving] = useState(false);

  function toStateMap(map: Map<LimitKey, number | null>): Record<LimitKey, string> {
    const result = {} as Record<LimitKey, string>;
    for (const key of LIMIT_KEYS) {
      const v = map.get(key);
      result[key] = v === null || v === undefined ? "" : String(v);
    }
    return result;
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.patch(`/api/super-admin/plans/${plan.id}/limits`, {
        limits: LIMIT_KEYS.map((key) => ({
          limitKey: key,
          limitValue: state[key].trim() === "" ? null : Number(state[key]),
        })),
      });
      toast.success("Limits updated.");
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update limits");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(toStateMap(limitByKey));
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Sliders className="size-4" />
        Limits
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan.name} — usage limits</DialogTitle>
          <DialogDescription>Leave a field blank for unlimited.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {LIMIT_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1">
              <p className="text-sm font-medium">{LIMIT_LABELS[key]}</p>
              <Input
                type="number"
                min="0"
                className="w-28"
                placeholder="Unlimited"
                value={state[key]}
                onChange={(e) => setState((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicatePlanDialog({ plan, onDuplicated }: { plan: Plan; onDuplicated: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(`${plan.code}_COPY`);
  const [name, setName] = useState(`${plan.name} (Copy)`);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.post(`/api/super-admin/plans/${plan.id}/duplicate`, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
      });
      toast.success("Plan duplicated — review and activate it when ready.");
      setOpen(false);
      onDuplicated();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to duplicate plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Copy className="size-4" />
        Duplicate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate {plan.name}</DialogTitle>
          <DialogDescription>Copies pricing, features, and limits into a new, disabled plan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field>
            <FieldLabel>New code</FieldLabel>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
          <Field>
            <FieldLabel>New name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!code.trim() || !name.trim() || saving} onClick={handleSubmit}>
            {saving ? "Duplicating…" : "Duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchivePlanButton({ plan, onArchived }: { plan: Plan; onArchived: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      await api.post(`/api/super-admin/plans/${plan.id}/archive`, {});
      toast.success("Plan archived.");
      setOpen(false);
      onArchived();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to archive plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" />}>
        <Archive className="size-4" />
        Archive
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {plan.name}?</DialogTitle>
          <DialogDescription>
            This hides it from the public pricing page and every upgrade/downgrade picker.
            Existing subscribers already on this plan keep their current access — archiving
            never retroactively changes anyone&apos;s plan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={saving} onClick={handleConfirm}>
            {saving ? "Archiving…" : "Archive Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewFeatureDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.post("/api/super-admin/features", {
        key: key.trim().toLowerCase(),
        label: label.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
      });
      toast.success("Feature created.");
      setOpen(false);
      setKey("");
      setLabel("");
      setDescription("");
      setCategory("");
      onCreated();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to create feature");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        New Feature
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Feature</DialogTitle>
          <DialogDescription>Add a new gatable premium feature to the catalog.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field>
            <FieldLabel>Key</FieldLabel>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              placeholder="custom_domains"
            />
          </Field>
          <Field>
            <FieldLabel>Label</FieldLabel>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Custom Domains" />
          </Field>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="branding" />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!key.trim() || !label.trim() || saving} onClick={handleSubmit}>
            {saving ? "Creating…" : "Create Feature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
