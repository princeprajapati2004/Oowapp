"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Settings2 } from "lucide-react";
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

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  planFeatures: PlanFeatureRow[];
}

export function PlanManager({ plans, features }: { plans: Plan[]; features: Feature[] }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Plans and their default feature entitlements. Per-business overrides live on
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{plan.name}</CardTitle>
          {!plan.isActive && <Badge variant="outline">Inactive</Badge>}
        </div>
        <CardDescription>{plan.description || plan.code}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {enabledCount} of {features.length} features enabled by default
        </p>
        <div className="flex gap-2">
          <EditPlanDialog plan={plan} onSaved={onChanged} />
          <ManageFeaturesDialog
            plan={plan}
            features={features}
            enabledByFeatureId={enabledByFeatureId}
            onSaved={onChanged}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function NewPlanDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.post("/api/super-admin/plans", {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Plan created.");
      setOpen(false);
      setCode("");
      setName("");
      setDescription("");
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
              placeholder="STANDARD"
            />
          </Field>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard" />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
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
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.patch(`/api/super-admin/plans/${plan.id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
        isActive,
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
