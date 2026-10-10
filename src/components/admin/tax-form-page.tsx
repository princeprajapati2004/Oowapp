"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormRow } from "@/components/shared/form-row";
import { api, ApiError } from "@/lib/api-client";
import type { Category } from "@/generated/prisma/client";
import type { listTaxes } from "@/lib/services/tax";
import type { serializeTaxes } from "@/lib/serialize";

type TaxRow = ReturnType<typeof serializeTaxes<Awaited<ReturnType<typeof listTaxes>>[number]>>[number];

const EMPTY_FORM = {
  name: "",
  type: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
  value: "",
  appliesTo: "ENTIRE_BILL" as "ENTIRE_BILL" | "CATEGORY",
  categoryId: null as string | null,
  isEnabled: true,
};

function formFromTax(tax: TaxRow): typeof EMPTY_FORM {
  return {
    name: tax.name,
    type: tax.type,
    value: String(tax.value),
    appliesTo: tax.appliesTo,
    categoryId: tax.categoryId,
    isEnabled: tax.isEnabled,
  };
}

// Full-page Add/Edit Tax — replaces the centered Dialog in
// taxes-manager.tsx (popup-to-full-page conversion, batch 2).
export function TaxFormPage({ tax, categories }: { tax?: TaxRow; categories: Category[] }) {
  const router = useRouter();
  const isEditing = !!tax;

  const [form, setForm] = useState(() => (tax ? formFromTax(tax) : EMPTY_FORM));
  const [saving, setSaving] = useState(false);

  function goBack() {
    router.push("/admin/taxes");
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Name is required");
    const valueNum = Number(form.value);
    if (!Number.isFinite(valueNum) || valueNum < 0) return toast.error("Enter a valid value");
    if (form.appliesTo === "CATEGORY" && !form.categoryId) {
      return toast.error("Select a category");
    }

    const payload = {
      name: form.name,
      type: form.type,
      value: valueNum,
      appliesTo: form.appliesTo,
      categoryId: form.appliesTo === "CATEGORY" ? form.categoryId : null,
      isEnabled: form.isEnabled,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await api.patch(`/api/admin/taxes/${tax.id}`, payload);
        toast.success("Tax updated");
      } else {
        await api.post("/api/admin/taxes", payload);
        toast.success("Tax added");
      }
      router.push("/admin/taxes");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b bg-background/98 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={goBack}
          aria-label="Back to taxes"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-semibold">{isEditing ? "Edit Tax" : "Add Tax"}</h1>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5">
        <FormRow label="Name" htmlFor="tax-name" required>
          <Input
            id="tax-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. GST 5%"
            autoFocus
          />
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Type" htmlFor="tax-type">
            <Select value={form.type} onValueChange={(v) => v && setForm((f) => ({ ...f, type: v as typeof f.type }))}>
              <SelectTrigger id="tax-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                <SelectItem value="FIXED">Fixed amount</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
          <FormRow label="Value" htmlFor="tax-value" required>
            <Input
              id="tax-value"
              type="number"
              min={0}
              step="0.01"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
          </FormRow>
        </div>

        <FormRow label="Applies to" htmlFor="tax-applies-to">
          <Select
            value={form.appliesTo}
            onValueChange={(v) => v && setForm((f) => ({ ...f, appliesTo: v as typeof f.appliesTo, categoryId: null }))}
          >
            <SelectTrigger id="tax-applies-to" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ENTIRE_BILL">Entire bill</SelectItem>
              <SelectItem value="CATEGORY">A specific category</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>

        {form.appliesTo === "CATEGORY" && (
          <FormRow label="Category" htmlFor="tax-category" required>
            <Select value={form.categoryId ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
              <SelectTrigger id="tax-category" className="w-full">
                <SelectValue>{categories.find((c) => c.id === form.categoryId)?.name ?? "Select category"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
        )}

        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
          <p className="text-sm font-medium select-none">Enabled</p>
          <Switch checked={form.isEnabled} onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))} />
        </div>
      </main>

      <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2 border-t bg-background/98 px-4 py-3 backdrop-blur-sm">
        <Button variant="outline" onClick={goBack} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
