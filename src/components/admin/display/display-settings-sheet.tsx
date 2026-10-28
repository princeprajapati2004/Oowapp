"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Clock, Soup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { ToggleRow } from "@/components/shared/toggle-row";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { DISPLAY_TYPE_LABELS, type DisplayPayload, type DisplaySettings } from "@/lib/display-types";

const THEME_OPTIONS = [
  { value: "auto", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const LAYOUT_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];
const FONT_SIZE_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];
const CARD_SIZE_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

function PreviewCard({ settings }: { settings: DisplaySettings }) {
  const fontClass = settings.fontSize === "sm" ? "text-xs" : settings.fontSize === "lg" ? "text-base" : "text-sm";
  const padClass = settings.cardSize === "compact" ? "p-2.5" : settings.cardSize === "spacious" ? "p-5" : "p-3.5";
  const dark = settings.theme === "dark";

  return (
    <div className={cn("rounded-xl p-4", dark ? "bg-slate-900" : "bg-muted/40")}>
      <div
        className={cn(
          "mx-auto max-w-56 space-y-2 rounded-xl border shadow-sm",
          padClass,
          dark ? "border-slate-700 bg-slate-800 text-slate-100" : "border-border bg-card text-foreground"
        )}
      >
        <div className="flex items-center justify-between">
          <span className={cn("font-mono font-semibold", fontClass)}>#1042</span>
          <Badge variant="outline">Preparing</Badge>
        </div>
        {settings.showCustomerName && <p className={cn("font-medium", fontClass)}>Rahul Sharma</p>}
        {settings.showItemDetails ? (
          <div className={cn("space-y-0.5 text-muted-foreground", fontClass)}>
            <p>2× Paneer Tikka</p>
            <p>1× Butter Naan</p>
          </div>
        ) : (
          <p className={cn("text-muted-foreground", fontClass)}>3 items</p>
        )}
        {settings.showAmounts && <p className={cn("font-semibold", fontClass)}>₹450.00</p>}
        {settings.showPrepTime && (
          <div className={cn("flex items-center gap-1 text-muted-foreground", fontClass)}>
            <Clock className="size-3.5" /> Ready by 7:20 PM
          </div>
        )}
      </div>
    </div>
  );
}

export function DisplaySettingsSheet({
  display,
  onOpenChange,
  onSaved,
}: {
  display: DisplayPayload;
  onOpenChange: (open: boolean) => void;
  onSaved: (display: DisplayPayload) => void;
}) {
  const [settings, setSettings] = useState<DisplaySettings>(display.settings);
  const [allowStaffActions, setAllowStaffActions] = useState(display.allowStaffActions);
  const [overrideDelay, setOverrideDelay] = useState(display.settings.delayedAlertMinutes != null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.patch<DisplayPayload>(`/api/admin/displays/${display.id}`, {
        action: "update",
        settings,
        ...(display.type === "KITCHEN" ? { allowStaffActions } : {}),
      });
      toast.success("Display settings saved");
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{display.name}</SheetTitle>
          <SheetDescription>{DISPLAY_TYPE_LABELS[display.type]} settings</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
            <PreviewCard settings={settings} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <ReportSelect value={settings.theme} onValueChange={(v) => set("theme", v as DisplaySettings["theme"])} options={THEME_OPTIONS} />
            </div>
            <div className="space-y-1.5">
              <Label>Layout</Label>
              <ReportSelect value={settings.layout} onValueChange={(v) => set("layout", v as DisplaySettings["layout"])} options={LAYOUT_OPTIONS} />
            </div>
            <div className="space-y-1.5">
              <Label>Font size</Label>
              <ReportSelect value={settings.fontSize} onValueChange={(v) => set("fontSize", v as DisplaySettings["fontSize"])} options={FONT_SIZE_OPTIONS} />
            </div>
            <div className="space-y-1.5">
              <Label>Card size</Label>
              <ReportSelect value={settings.cardSize} onValueChange={(v) => set("cardSize", v as DisplaySettings["cardSize"])} options={CARD_SIZE_OPTIONS} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Privacy & content</p>
            <ToggleRow label="Show customer name" checked={settings.showCustomerName} onCheckedChange={(v) => set("showCustomerName", v)} />
            <ToggleRow label="Show item details" description="Off shows only an item count." checked={settings.showItemDetails} onCheckedChange={(v) => set("showItemDetails", v)} />
            <ToggleRow label="Show order amount" checked={settings.showAmounts} onCheckedChange={(v) => set("showAmounts", v)} />
            <ToggleRow label="Show preparation time" checked={settings.showPrepTime} onCheckedChange={(v) => set("showPrepTime", v)} />
            <ToggleRow label="Show completed orders" checked={settings.showCompletedOrders} onCheckedChange={(v) => set("showCompletedOrders", v)} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Behavior</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Active order limit</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={settings.activeOrderLimit}
                  onChange={(e) => set("activeOrderLimit", Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Auto-remove completed (min)</Label>
                <Input
                  type="number"
                  min={0}
                  max={180}
                  value={settings.autoRemoveCompletedMinutes}
                  onChange={(e) => set("autoRemoveCompletedMinutes", Math.max(0, Math.min(180, Number(e.target.value) || 0)))}
                />
              </div>
            </div>
            <ToggleRow label="Sound alerts" description="New order, ready and delayed chimes on this display." checked={settings.soundEnabled} onCheckedChange={(v) => set("soundEnabled", v)} />
            <ToggleRow
              label="Custom delayed-order threshold"
              description="Off uses the shop-wide preparation-time setting."
              checked={overrideDelay}
              onCheckedChange={(v) => {
                setOverrideDelay(v);
                set("delayedAlertMinutes", v ? (settings.delayedAlertMinutes ?? 15) : null);
              }}
            />
            {overrideDelay && (
              <Input
                type="number"
                min={1}
                max={180}
                value={settings.delayedAlertMinutes ?? 15}
                onChange={(e) => set("delayedAlertMinutes", Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
              />
            )}
          </div>

          {display.type === "KITCHEN" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Device access</p>
              <ToggleRow
                label="Allow this display to act on orders"
                description="Without a staff login, this device can accept, start preparing, mark ready, and flag delays — nothing else (no payments, no settings)."
                checked={allowStaffActions}
                onCheckedChange={setAllowStaffActions}
                id="allow-staff-actions"
              />
              {allowStaffActions && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/25 dark:text-amber-300">
                  <Soup className="mt-0.5 size-3.5 shrink-0" />
                  Anyone with this display&apos;s URL/QR code can update orders. Keep it on a trusted kitchen device and rotate the link if it&apos;s ever shared outside the kitchen.
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
