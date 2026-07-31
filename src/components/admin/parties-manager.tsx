"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Users, Phone, Building2, MapPin, Receipt, MessageCircle, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { cn } from "@/lib/utils";
import type { listPartiesWithBalances } from "@/lib/services/party";

type PartyRow = Awaited<ReturnType<typeof listPartiesWithBalances>>[number];
// create/update API responses return the raw party row, without the
// listing endpoint's computed orderCount/outstanding fields.
type PartyDetail = Omit<PartyRow, "orderCount" | "outstanding">;

type FilterValue = "all" | "CUSTOMER" | "SUPPLIER" | "VIP" | "WHOLESALE" | "RETAIL" | "DUE" | "ADVANCE";

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "CUSTOMER", label: "Customers" },
  { value: "SUPPLIER", label: "Suppliers" },
  { value: "VIP", label: "VIP" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "RETAIL", label: "Retail" },
  { value: "DUE", label: "Due" },
  { value: "ADVANCE", label: "Advance" },
];

type SortValue = "newest" | "name" | "due" | "advance";

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name (A-Z)" },
  { value: "due", label: "Highest due" },
  { value: "advance", label: "Highest advance" },
];

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

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

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function PartiesManager({
  initialParties,
  currency,
}: {
  initialParties: PartyRow[];
  currency: string;
}) {
  const [parties, setParties] = useState(initialParties);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortValue>("newest");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartyRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = parties.filter((party) => {
      const matchesSearch =
        !q ||
        party.name.toLowerCase().includes(q) ||
        party.phone.toLowerCase().includes(q) ||
        (party.gstNumber ?? "").toLowerCase().includes(q) ||
        (party.businessName ?? "").toLowerCase().includes(q) ||
        (party.address ?? "").toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "CUSTOMER" && party.type === "CUSTOMER") ||
        (filter === "SUPPLIER" && party.type === "SUPPLIER") ||
        (filter === "DUE" && party.outstanding > 0) ||
        (filter === "ADVANCE" && party.outstanding < 0) ||
        party.category === filter;
      return matchesSearch && matchesFilter;
    });

    const sorted = [...result];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "due") {
      sorted.sort((a, b) => b.outstanding - a.outstanding);
    } else if (sort === "advance") {
      sorted.sort((a, b) => a.outstanding - b.outstanding);
    }
    // "newest" — already ordered by createdAt desc from the server, no re-sort needed.
    return sorted;
  }, [parties, search, filter, sort]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(party: PartyRow) {
    setEditing(party);
    setForm({
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
    });
    setDialogOpen(true);
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
      if (editing) {
        await api.patch<PartyDetail>(`/api/admin/parties/${editing.id}`, payload);
        // Refetch rather than patch local state in place: editing openingBalance
        // or type (customer<->supplier) changes the outstanding-balance formula
        // itself, so only the server's recomputed value is trustworthy.
        const refreshed = await api.get<PartyRow[]>("/api/admin/parties");
        setParties(refreshed);
        toast.success("Party updated");
      } else {
        await api.post<PartyDetail>("/api/admin/parties", payload);
        // Refetch: a brand-new party's phone may already match pre-existing
        // orders (e.g. a walk-in customer added as a Party after the fact),
        // so outstanding isn't simply the opening balance — only the server
        // computation accounts for that.
        const refreshed = await api.get<PartyRow[]>("/api/admin/parties");
        setParties(refreshed);
        toast.success("Party added");
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
      await api.delete(`/api/admin/parties/${deleteTarget.id}`);
      setParties((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success("Party deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parties</h1>
          <p className="text-muted-foreground">Manage customers, suppliers & dues.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add Party
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, GST, business, address…"
            className="pl-9 h-9 bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter((v as FilterValue) ?? "all")}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue>{FILTER_OPTIONS.find((f) => f.value === filter)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort((v as SortValue) ?? "newest")}>
          <SelectTrigger className="w-44 h-9">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
            <SelectValue>{SORT_OPTIONS.find((s) => s.value === sort)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={parties.length === 0 ? "No parties yet" : "No parties found"}
          description={
            parties.length === 0
              ? "Add your first customer or supplier to start tracking dues."
              : "Try a different search or filter."
          }
          action={parties.length === 0 ? <Button onClick={openCreate}>Add Party</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((party) => (
            <div
              key={party.id}
              className="rounded-xl border bg-card p-4 space-y-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <Link href={`/admin/parties/${party.id}`} className="flex items-start gap-3">
                <Avatar size="lg">
                  <AvatarFallback>{initials(party.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{party.name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" /> {party.phone}
                  </div>
                  {party.businessName && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                      <Building2 className="size-3 shrink-0" /> {party.businessName}
                    </div>
                  )}
                </div>
              </Link>

              <div className="flex flex-wrap items-center gap-1">
                <Badge variant="secondary" className="text-xs">
                  {party.type === "CUSTOMER" ? "Customer" : "Supplier"}
                </Badge>
                {party.category !== "GENERAL" && (
                  <Badge variant="outline" className="text-xs">
                    {party.category.charAt(0) + party.category.slice(1).toLowerCase()}
                  </Badge>
                )}
              </div>

              {party.address && (
                <div className="flex items-start gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3 shrink-0 mt-0.5" /> <span className="line-clamp-2">{party.address}</span>
                </div>
              )}
              {party.gstNumber && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Receipt className="size-3 shrink-0" /> GST: {party.gstNumber}
                </div>
              )}

              <div className="flex items-center justify-between border-t pt-2.5">
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p
                    className={cn(
                      "font-bold text-sm tabular-nums",
                      party.outstanding > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : party.outstanding < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {formatCurrency(party.outstanding, currency)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    render={<a href={`tel:${party.phone}`} onClick={(e) => e.stopPropagation()} />}
                    nativeButton={false}
                    aria-label="Call"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    render={<a href={waLink(party.phone)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} />}
                    nativeButton={false}
                    aria-label="WhatsApp"
                    className="text-muted-foreground hover:text-emerald-600"
                  >
                    <MessageCircle className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(party)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(party)}
                    aria-label="Delete"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
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
        title="Delete party?"
        description={`"${deleteTarget?.name}" and their payment history will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
