"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type PartyFormEditTarget = {
  id: string;
  type: "CUSTOMER" | "SUPPLIER";
  name: string;
  phone: string;
  gstNumber: string | null;
  businessName: string | null;
  address: string | null;
  category: "VIP" | "WHOLESALE" | "RETAIL" | "GENERAL";
  openingBalance: number;
  creditLimit: number | null;
  notes: string | null;
};

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

export function PartyFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PartyFormEditTarget | null;
  // Fired after a successful create/update, dialog already closed. The caller
  // refetches from the server rather than trusting this component's payload —
  // outstanding/orderCount are computed server-side and not part of the form.
  // On a fresh create (not edit), the newly-created party is also passed —
  // callers that need to auto-select it (e.g. the "add supplier inline" flow
  // on the New Purchase page) don't have to re-fetch the list to find it.
  onSaved: (created?: { id: string; name: string; phone: string; type: "CUSTOMER" | "SUPPLIER" }) => void | Promise<void>;
  // Pre-selects the Customer/Supplier toggle on a fresh "Add party" open
  // (e.g. the New Purchase page opens this wanting a supplier, not the
  // form's normal customer-first default). Ignored while editing.
  defaultType?: "CUSTOMER" | "SUPPLIER";
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        type: editing.type,
        name: editing.name,
        phone: editing.phone,
        gstNumber: editing.gstNumber ?? "",
        businessName: editing.businessName ?? "",
        address: editing.address ?? "",
        category: editing.category,
        openingBalance: String(editing.openingBalance),
        creditLimit: editing.creditLimit === null ? "" : String(editing.creditLimit),
        notes: editing.notes ?? "",
      });
    } else {
      setForm({ ...EMPTY_FORM, type: defaultType ?? EMPTY_FORM.type });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

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
      if (editing) {
        await api.patch(`/api/admin/parties/${editing.id}`, payload);
        toast.success("Party updated");
        onOpenChange(false);
        await onSaved();
      } else {
        const created = await api.post<{ id: string; name: string; phone: string; type: "CUSTOMER" | "SUPPLIER" }>(
          "/api/admin/parties",
          payload
        );
        toast.success("Party added");
        onOpenChange(false);
        await onSaved(created);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 gap-0 sm:max-w-lg max-h-[92dvh] overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-5 py-4 border-b">
          <DialogTitle>{editing ? "Edit party" : "Add party"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-muted/50 px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
