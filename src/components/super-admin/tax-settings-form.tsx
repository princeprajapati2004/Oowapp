"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";

interface TaxConfig {
  enabled: boolean;
  percentage: number;
  cgst: number;
  sgst: number;
  igst: number;
  inclusive: boolean;
}

export function TaxSettingsForm({ initial }: { initial: TaxConfig }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [percentage, setPercentage] = useState(String(initial.percentage));
  const [cgst, setCgst] = useState(String(initial.cgst));
  const [sgst, setSgst] = useState(String(initial.sgst));
  const [igst, setIgst] = useState(String(initial.igst));
  const [inclusive, setInclusive] = useState(initial.inclusive);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put("/api/super-admin/subscription-tax", {
        enabled,
        percentage: Number(percentage),
        cgst: Number(cgst),
        sgst: Number(sgst),
        igst: Number(igst),
        inclusive,
      });
      toast.success("Tax settings saved.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save tax settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subscription GST</CardTitle>
        <CardDescription>
          Applied to every self-service subscription checkout. Never hardcoded in the
          frontend — the checkout page always calls this configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <Field orientation="horizontal">
          <FieldLabel>Tax enabled</FieldLabel>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Field>
        <Field>
          <FieldLabel>Overall percentage</FieldLabel>
          <Input type="number" min="0" max="100" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>CGST %</FieldLabel>
            <Input type="number" min="0" max="100" value={cgst} onChange={(e) => setCgst(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>SGST %</FieldLabel>
            <Input type="number" min="0" max="100" value={sgst} onChange={(e) => setSgst(e.target.value)} />
          </Field>
        </div>
        <Field>
          <FieldLabel>IGST % (inter-state)</FieldLabel>
          <Input type="number" min="0" max="100" value={igst} onChange={(e) => setIgst(e.target.value)} />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel>Prices are tax-inclusive</FieldLabel>
          <Switch checked={inclusive} onCheckedChange={setInclusive} />
        </Field>
        <Button disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save Tax Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
