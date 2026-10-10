"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormRow } from "@/components/shared/form-row";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { PartyFormEditTarget } from "@/components/admin/party-form-dialog";

const EMPTY_FORM = {
  type: "CUSTOMER" as "CUSTOMER" | "SUPPLIER",
  name: "",
  phone: "",
  gstNumber: "",
  businessName: "",
  address: "",
  category: "GENERAL" as "VIP" | "WHOLESALE" | "RETAIL" | "GENERAL",
  openingBalance: "0",
  creditLimit: "",
  notes: "",
};

function formFromParty(party: PartyFormEditTarget): typeof EMPTY_FORM {
  return {
    type: party.type,
    name: party.name,
    phone: party.phone,
    gstNumber: party.gstNumber ?? "",
    businessName: party.businessName ?? "",
    address: party.address ?? "",
    category: party.category,
    openingBalance: String(party.openingBalance),
    creditLimit: party.creditLimit === null ? "" : String(party.creditLimit),
    notes: party.notes ?? "",
  };
}

// Full-page Add/Edit Party — replaces the centered PartyFormDialog for the
// primary Parties list/detail flows (popup-to-full-page conversion, batch
// 2). party-form-dialog.tsx itself is intentionally left untouched: it's
// still used for the inline "add supplier without leaving this form" flow
// on the New Purchase page, where navigating away to a full page would lose
// the in-progress purchase.
export function PartyFormPage({
  party,
  // Edits land back on the party's own detail/statement page; a fresh
  // create has nowhere to return to but the list.
  returnTo,
}: {
  party?: PartyFormEditTarget;
  returnTo: string;
}) {
  const router = useRouter();
  const isEditing = !!party;

  const [form, setForm] = useState(() => (party ? formFromParty(party) : EMPTY_FORM));
  const [saving, setSaving] = useState(false);

  function goBack() {
    router.push(returnTo);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.phone.trim()) return toast.error("Phone is required");

    const payload = {
      type: form.type,
      name: form.name,
      phone: form.phone,
      gstNumber: form.gstNumber,
      businessName: form.businessName,
      address: form.address,
      category: form.category,
      openingBalance: form.openingBalance === "" ? 0 : Number(form.openingBalance),
      creditLimit: form.creditLimit === "" ? null : Number(form.creditLimit),
      notes: form.notes,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await api.patch(`/api/admin/parties/${party.id}`, payload);
        toast.success("Party updated");
      } else {
        await api.post("/api/admin/parties", payload);
        toast.success("Party added");
      }
      router.push(returnTo);
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
          aria-label="Back"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-semibold">{isEditing ? "Edit Party" : "Add Party"}</h1>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5">
        <div className="flex overflow-hidden rounded-md border text-sm">
          {(["CUSTOMER", "SUPPLIER"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: t }))}
              className={cn(
                "flex-1 px-3 py-2 font-medium transition-colors",
                form.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t === "CUSTOMER" ? "Customer" : "Supplier"}
            </button>
          ))}
        </div>

        <FormRow label="Name" htmlFor="party-name" required>
          <Input id="party-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </FormRow>

        <FormRow label="Phone number" htmlFor="party-phone" required>
          <Input id="party-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="GST" htmlFor="party-gst">
            <Input id="party-gst" value={form.gstNumber} onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))} />
          </FormRow>
          <FormRow label="Business name" htmlFor="party-business">
            <Input id="party-business" value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
          </FormRow>
        </div>

        <FormRow label="Address" htmlFor="party-address">
          <Textarea id="party-address" rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </FormRow>

        <FormRow label="Category" htmlFor="party-category">
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: (v as typeof f.category) ?? "GENERAL" }))}>
            <SelectTrigger id="party-category" className="w-full">
              <SelectValue>{form.category.charAt(0) + form.category.slice(1).toLowerCase()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GENERAL">General</SelectItem>
              <SelectItem value="VIP">VIP</SelectItem>
              <SelectItem value="WHOLESALE">Wholesale</SelectItem>
              <SelectItem value="RETAIL">Retail</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Opening balance" htmlFor="party-opening" description="What they already owe (or you owe them)">
            <Input
              id="party-opening"
              type="number"
              step="0.01"
              value={form.openingBalance}
              onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
            />
          </FormRow>
          <FormRow label="Credit limit" htmlFor="party-credit" description="Optional">
            <Input
              id="party-credit"
              type="number"
              step="0.01"
              min={0}
              value={form.creditLimit}
              onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
            />
          </FormRow>
        </div>

        <FormRow label="Notes" htmlFor="party-notes" description="Optional">
          <Textarea id="party-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </FormRow>
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
