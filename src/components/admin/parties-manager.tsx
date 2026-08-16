"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  Phone,
  MessageCircle,
  ArrowUpDown,
  SlidersHorizontal,
  MoreVertical,
  Eye,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PartyFormDialog } from "@/components/admin/party-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { listPartiesWithBalances } from "@/lib/services/party";

type PartyRow = Awaited<ReturnType<typeof listPartiesWithBalances>>[number];

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

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Deterministic pastel avatar color, keyed off the name so a given party
// always gets the same color across renders/sessions.
const AVATAR_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-400",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
];

function avatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function partyTypeLabel(party: { type: "CUSTOMER" | "SUPPLIER"; category: "GENERAL" | "VIP" | "WHOLESALE" | "RETAIL" }) {
  const role = party.type === "CUSTOMER" ? "Customer" : "Supplier";
  if (party.category === "GENERAL") return party.type === "CUSTOMER" ? "Regular Customer" : "Supplier";
  const category = party.category.charAt(0) + party.category.slice(1).toLowerCase();
  return `${category} ${role}`;
}

function outstandingBadge(outstanding: number, currency: string) {
  if (outstanding > 0) {
    return {
      label: `Due ${formatCurrency(outstanding, currency)}`,
      className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    };
  }
  if (outstanding < 0) {
    return {
      label: `Advance ${formatCurrency(Math.abs(outstanding), currency)}`,
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    };
  }
  return {
    label: "Settled",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  };
}

export function PartiesManager({
  initialParties,
  currency,
}: {
  initialParties: PartyRow[];
  currency: string;
}) {
  const router = useRouter();
  const [parties, setParties] = useState(initialParties);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortValue>("newest");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PartyRow | null>(null);

  // Launched from the Quick Actions FAB ("Add Party / Customer" →
  // /admin/parties?new=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(null);
    setDialogOpen(true);
    router.replace("/admin/parties", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setDialogOpen(true);
  }

  function openEdit(party: PartyRow) {
    setEditing(party);
    setDialogOpen(true);
  }

  async function handlePartySaved() {
    // Refetch rather than patch local state in place: a saved opening balance,
    // type change, or brand-new party's phone matching pre-existing orders can
    // all change the outstanding-balance formula — only the server's
    // recomputed value is trustworthy.
    const refreshed = await api.get<PartyRow[]>("/api/admin/parties");
    setParties(refreshed);
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

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer by name or phone…"
            className="pl-10 h-11 rounded-full bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
          />
        </div>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label="Filter and sort"
                className="relative h-11 w-11 shrink-0 rounded-full"
              />
            }
          >
            <SlidersHorizontal className="size-4" />
            {(filter !== "all" || sort !== "newest") && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
            )}
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Filter</p>
              <Select value={filter} onValueChange={(v) => setFilter((v as FilterValue) ?? "all")}>
                <SelectTrigger className="w-full h-9">
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
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <ArrowUpDown className="size-3" /> Sort by
              </p>
              <Select value={sort} onValueChange={(v) => setSort((v as SortValue) ?? "newest")}>
                <SelectTrigger className="w-full h-9">
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
          </PopoverContent>
        </Popover>
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
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filtered.map((party) => {
            const badge = outstandingBadge(party.outstanding, currency);
            return (
              <div
                key={party.id}
                className="group flex items-center gap-3 rounded-[20px] border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
              >
                <Link href={`/admin/parties/${party.id}`} className="flex flex-1 min-w-0 items-center gap-3">
                  <Avatar size="lg" className="h-12 w-12 shrink-0">
                    <AvatarFallback className={cn("text-base font-semibold", avatarPalette(party.name))}>
                      {initials(party.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-bold text-[15px] sm:text-lg leading-tight truncate">{party.name}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">{partyTypeLabel(party)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("border-0 font-semibold", badge.className)}>{badge.label}</Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" /> {party.phone}
                      </span>
                    </div>
                  </div>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0 text-muted-foreground")}
                    aria-label="More actions"
                  >
                    <MoreVertical className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem render={<Link href={`/admin/parties/${party.id}`} />}>
                      <Eye className="size-4" /> View details
                    </DropdownMenuItem>
                    <DropdownMenuItem render={<a href={`tel:${party.phone}`} />}>
                      <Phone className="size-4" /> Call
                    </DropdownMenuItem>
                    <DropdownMenuItem render={<a href={waLink(party.phone)} target="_blank" rel="noopener noreferrer" />}>
                      <MessageCircle className="size-4" /> WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEdit(party)}>
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(party)}>
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <PartyFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={handlePartySaved} />

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
