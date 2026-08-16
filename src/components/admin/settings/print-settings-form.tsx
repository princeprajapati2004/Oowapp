"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { PRINT_FORMATS, type PrintFormat } from "@/lib/types/print";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PrintSettingsForm({
  defaultFormat,
  bare,
}: {
  defaultFormat: PrintFormat;
  bare?: boolean;
}) {
  const [selected, setSelected] = useState<PrintFormat>(defaultFormat);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch("/api/admin/business", { section: "print", printFormat: selected });
      toast.success("Print settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save print settings");
    } finally {
      setSaving(false);
    }
  }

  const formContent = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {PRINT_FORMATS.map((f) => (
          <label
            key={f.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors min-h-11",
              selected === f.value ? "border-primary bg-primary/5" : "hover:bg-muted/40"
            )}
          >
            <input
              type="radio"
              name="printFormat"
              checked={selected === f.value}
              onChange={() => setSelected(f.value)}
              className="accent-primary size-4 shrink-0"
            />
            <span className="font-medium">{f.label}</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        This is the layout every &quot;Print Bill&quot; / &quot;Print&quot; action opens automatically — no need to pick a
        format each time.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save print settings"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => window.open(`/admin/print-preview?format=${selected}`, "_blank")}
        >
          <Eye className="size-4" /> Preview
        </Button>
      </div>
    </div>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Print settings</CardTitle>
        <CardDescription>Choose the default layout used by every &quot;Print Bill&quot; action.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
