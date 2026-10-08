"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Search, User, UserPlus, X, Clock, Phone, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { PartyLite } from "@/lib/types/manual-order";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// Loose check only (section 10: "Validate mobile number properly") — this
// business operates across phone formats (landline extensions, +91, etc.),
// so this blocks obvious junk (too short/non-numeric) without pretending to
// be a strict E.164 validator the backend doesn't enforce either.
function phoneLooksValid(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export interface CustomerSelection {
  name: string;
  phone: string;
  party?: PartyLite;
}

interface CustomerPickerPanelProps {
  currency: string;
  parties: PartyLite[];
  loadingParties: boolean;
  recentPhones: string[];
  onSelect: (selection: CustomerSelection | null) => void;
  onPartyCreated: (party: PartyLite) => void;
  onClose: () => void;
}

export function CustomerPickerPanel({
  currency,
  parties,
  loadingParties,
  recentPhones,
  onSelect,
  onPartyCreated,
  onClose,
}: CustomerPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return parties;
    return parties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [parties, q]);

  const recentParties = useMemo(
    () => recentPhones.map((phone) => parties.find((p) => p.phone === phone)).filter((p): p is PartyLite => !!p),
    [recentPhones, parties]
  );

  function pick(party: PartyLite) {
    onSelect({ name: party.name, phone: party.phone, party });
  }

  function pickWalkIn() {
    onSelect(null);
  }

  async function handleSaveCustomer() {
    setFormError(null);
    const name = newName.trim();
    const phone = newPhone.trim();
    if (!name) {
      setFormError("Customer name is required.");
      return;
    }
    if (!phoneLooksValid(phone)) {
      setFormError("Enter a valid mobile number.");
      return;
    }
    // Same (shopId, phone) uniqueness the order-creation path already
    // enforces server-side — checked here too so the Owner sees it before
    // attempting a save, not just as a 409 toast.
    const clash = parties.find((p) => p.phone === phone);
    if (clash) {
      setFormError(`A customer with this number already exists — "${clash.name}". Select them instead of adding a duplicate.`);
      return;
    }
    setSaving(true);
    try {
      const party = await api.post<PartyLite>("/api/admin/parties", { name, phone, type: "CUSTOMER" });
      onPartyCreated(party);
      toast.success(`Saved ${party.name} as a new customer`);
      onSelect({ name: party.name, phone: party.phone, party });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save this customer. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function customerRow(party: PartyLite, key: string) {
    return (
      <button
        key={key}
        onClick={() => pick(party)}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary hover:bg-primary/5"
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", avatarColor(party.name))}>
          {initialsOf(party.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{party.name}</p>
          <p className="truncate text-xs text-muted-foreground">{party.phone}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {party.outstanding > 0 && (
            <Badge variant="outline" className="border-amber-300 text-amber-600 text-[10px]">
              Due {formatCurrency(party.outstanding, currency)}
            </Badge>
          )}
          {party.orderCount > 0 && (
            <span className="text-[10px] text-muted-foreground">{party.orderCount} order{party.orderCount !== 1 ? "s" : ""}</span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <button
          onClick={onClose}
          aria-label="Close customer selection"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Select Customer</h2>
          <p className="text-xs text-muted-foreground">Search by name, mobile number, or customer ID</p>
        </div>
      </header>

      <div className="shrink-0 space-y-2.5 border-b px-4 py-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Search customers"
            placeholder="Search by name, mobile or customer ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pr-8 pl-8"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={pickWalkIn}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
          >
            <User className="size-3.5" /> Walk-in Customer
          </button>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            aria-pressed={showAddForm}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
              showAddForm ? "border-primary bg-primary/10 text-primary" : "hover:border-primary hover:bg-primary/5"
            )}
          >
            <UserPlus className="size-3.5" /> Add New Customer
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="shrink-0 space-y-2.5 border-b bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">First-time customer</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Customer name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 text-sm"
            />
            <Input
              placeholder="Mobile number"
              inputMode="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowAddForm(false); setFormError(null); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveCustomer} disabled={saving}>
              {saving ? "Saving..." : "Save & Use"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!q && recentParties.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <p className="flex items-center gap-1 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              <Clock className="size-3" /> Recently used
            </p>
            <div className="space-y-1.5">{recentParties.map((p) => customerRow(p, `recent-${p.id}`))}</div>
          </div>
        )}

        <div className="space-y-1.5">
          {!q && (
            <p className="px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">All customers</p>
          )}
          {loadingParties ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Loading customers...</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Phone className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {q ? <>No customer matches &quot;{query}&quot;</> : "No customers yet"}
              </p>
              <button
                onClick={() => {
                  setShowAddForm(true);
                  setNewName("");
                  setNewPhone(/^\d+$/.test(query.trim()) ? query.trim() : "");
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                + Add as new customer
              </button>
            </div>
          ) : (
            filtered.map((p) => customerRow(p, p.id))
          )}
        </div>
      </div>

      <div className="shrink-0 border-t px-4 py-3 text-center text-[11px] text-muted-foreground">
        <Receipt className="mr-1 inline size-3" /> Selecting a customer links this order to their account — no duplicates are created.
      </div>
    </div>
  );
}
