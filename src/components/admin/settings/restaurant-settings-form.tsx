"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, QrCode } from "lucide-react";
import { restaurantSettingsSchema, type RestaurantSettingsInput } from "@/lib/validation/shop-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleRow } from "@/components/shared/toggle-row";
import { Badge } from "@/components/ui/badge";

export function RestaurantSettingsForm({
  defaultValues,
  bare,
}: {
  defaultValues: RestaurantSettingsInput;
  bare?: boolean;
}) {
  const [enableTableQr, setEnableTableQr] = useState(defaultValues.enableTableQr);
  const [tables, setTables] = useState<string[]>(defaultValues.tableNames);
  const [newTable, setNewTable] = useState("");
  const [saving, setSaving] = useState(false);

  function addTable() {
    const name = newTable.trim();
    if (!name) return;
    if (tables.includes(name)) {
      toast.error("Table already exists");
      return;
    }
    setTables((prev) => [...prev, name]);
    setNewTable("");
  }

  function removeTable(name: string) {
    setTables((prev) => prev.filter((t) => t !== name));
  }

  async function handleSave() {
    const parsed = restaurantSettingsSchema.safeParse({ enableTableQr, tableNames: tables });
    if (!parsed.success) {
      toast.error("Invalid settings");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/api/admin/business", {
        section: "restaurant",
        enableTableQr: parsed.data.enableTableQr,
        tableNames: parsed.data.tableNames,
      });
      toast.success("Restaurant settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <div className="space-y-4">
      <ToggleRow
        label="Enable table-wise QR ordering"
        description="Generate a unique QR per table. Customers scan their table's QR and the table number is auto-filled."
        checked={enableTableQr}
        onCheckedChange={setEnableTableQr}
      />

      {enableTableQr && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Tables ({tables.length})</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              render={<a href="/admin/qr" />}
            >
              <QrCode className="size-3.5" />
              Generate QRs
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="e.g. Table 1, VIP Room, Terrace 3"
              value={newTable}
              onChange={(e) => setNewTable(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTable())}
              className="h-9 flex-1"
            />
            <Button variant="outline" size="sm" onClick={addTable} className="h-9 gap-1.5 shrink-0">
              <Plus className="size-3.5" /> Add
            </Button>
          </div>

          {tables.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tables.map((table) => (
                <Badge
                  key={table}
                  variant="secondary"
                  className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-sm"
                >
                  {table}
                  <button
                    type="button"
                    onClick={() => removeTable(table)}
                    className="rounded-sm text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove ${table}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {tables.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tables added yet. Add tables above, then visit the QR page to generate codes.
            </p>
          )}
        </div>
      )}

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save restaurant settings"}
      </Button>
    </div>
  );

  if (bare) return content;

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
      <div className="px-4 py-4 border-b">
        <p className="font-heading text-base font-medium">Restaurant settings</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure table-wise QR ordering for your restaurant.
        </p>
      </div>
      <div className="px-4 py-4">{content}</div>
    </div>
  );
}
