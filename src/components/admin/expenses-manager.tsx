"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Receipt,
  TrendingDown,
  CalendarDays,
  ChevronDown,
  X,
  BarChart3,
  Calendar,
  Eye,
  Filter,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  ExpenseFormFields,
  ExpenseEditDialog,
  DEFAULT_EXPENSE_FORM,
  validateExpenseForm,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_BADGE,
  type Expense,
  type Vendor,
  type ExpenseFormData,
} from "@/components/admin/expense-form";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, type ExpenseInput } from "@/lib/validation/expense";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "today" | "yesterday" | "week" | "month" | "lastMonth" | "year" | "custom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPeriodRange(
  period: Period,
  month: string,
  customFrom: string,
  customTo: string
): { from: Date; to: Date } {
  const now = new Date();
  now.setSeconds(59, 999);

  if (period === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (period === "yesterday") {
    const from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (period === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - from.getDay());
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (period === "year") {
    const from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === "lastMonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === "custom") {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0);
    const to = customTo ? new Date(`${customTo}T23:59:59.999`) : now;
    return { from, to };
  }
  // month
  const [y, m] = month.split("-").map(Number);
  return {
    from: new Date(y, m - 1, 1, 0, 0, 0, 0),
    to: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  month: "Month",
  lastMonth: "Last Month",
  year: "This Year",
  custom: "Custom",
};

const ALL_SENTINEL = "__all__";

// ─── Inline Add Form ──────────────────────────────────────────────────────────

function InlineAddForm({
  parties,
  onSave,
  onClose,
}: {
  parties: Vendor[];
  onSave: (data: ExpenseInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ExpenseFormData>({ ...DEFAULT_EXPENSE_FORM });
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  function onChange<K extends keyof ExpenseFormData>(key: K, value: ExpenseFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateExpenseForm(form);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      await onSave(result.input);
      setForm({ ...DEFAULT_EXPENSE_FORM });
      setErrors({});
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <p className="text-sm font-semibold">New Expense</p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Cancel"
        >
          <X className="size-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <ExpenseFormFields form={form} errors={errors} parties={parties} onChange={onChange} />
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "Saving…" : "Add Expense"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  accent: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card p-4 space-y-2 text-left w-full transition-all duration-150",
        onClick && "hover:border-primary/40 hover:shadow-sm cursor-pointer",
        active && "border-primary/50 ring-1 ring-primary/20 bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn("flex size-8 items-center justify-center rounded-xl", accent)}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </button>
  );
}

// ─── Category Breakdown ───────────────────────────────────────────────────────

function CategoryBreakdown({
  expenses,
  currency,
  periodLabel,
}: {
  expenses: Expense[];
  currency: string;
  periodLabel: string;
}) {
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, total]) => ({ category, total }));
  }, [expenses]);

  if (byCategory.length === 0) return null;

  const grandTotal = byCategory.reduce((s, r) => s + r.total, 0);

  return (
    <Accordion>
      <AccordionItem value="breakdown">
        <AccordionTrigger className="px-4 text-sm font-semibold">
          {periodLabel} — category breakdown
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 px-1">
            {byCategory.map(({ category, total }) => {
              const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{category}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatCurrency(total, currency)}{" "}
                      <span className="text-xs">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ExpensesManager({
  initialExpenses,
  parties,
  currency,
}: {
  initialExpenses: Expense[];
  parties: Vendor[];
  currency: string;
}) {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [month, setMonth] = useState(currentMonthKey());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_SENTINEL);
  const [paymentFilter, setPaymentFilter] = useState(ALL_SENTINEL);
  const [vendorFilter, setVendorFilter] = useState(ALL_SENTINEL);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  // Launched from the Quick Actions FAB ("Add Expense" → /admin/expenses?new=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddFormOpen(true);
    router.replace("/admin/expenses", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Period label for display ───────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (period !== "month") return PERIOD_LABELS[period];
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }, [period, month]);

  const activeExtraFilterCount =
    (categoryFilter !== ALL_SENTINEL ? 1 : 0) +
    (paymentFilter !== ALL_SENTINEL ? 1 : 0) +
    (vendorFilter !== ALL_SENTINEL ? 1 : 0);

  // ── Filtered view ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const { from, to } = getPeriodRange(period, month, customFrom, customTo);
    return expenses.filter((e) => {
      const expDate = new Date(e.date);
      const inPeriod = expDate >= from && expDate <= to;
      const matchesSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.transactionReference ?? "").toLowerCase().includes(q) ||
        (e.party?.name ?? "").toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q);
      const matchesCategory = categoryFilter === ALL_SENTINEL || e.category === categoryFilter;
      const matchesPayment = paymentFilter === ALL_SENTINEL || e.paymentMethod === paymentFilter;
      const matchesVendor = vendorFilter === ALL_SENTINEL || e.partyId === vendorFilter;
      return inPeriod && matchesSearch && matchesCategory && matchesPayment && matchesVendor;
    });
  }, [expenses, search, period, month, customFrom, customTo, categoryFilter, paymentFilter, vendorFilter]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const todayTotal = useMemo(() => {
    const { from, to } = getPeriodRange("today", month, customFrom, customTo);
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= from && d <= to;
    }).reduce((s, e) => s + e.amount, 0);
  }, [expenses, month, customFrom, customTo]);

  const weekTotal = useMemo(() => {
    const { from, to } = getPeriodRange("week", month, customFrom, customTo);
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= from && d <= to;
    }).reduce((s, e) => s + e.amount, 0);
  }, [expenses, month, customFrom, customTo]);

  const monthTotal = useMemo(() => {
    const { from, to } = getPeriodRange("month", currentMonthKey(), customFrom, customTo);
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= from && d <= to;
    }).reduce((s, e) => s + e.amount, 0);
  }, [expenses, customFrom, customTo]);

  const yearTotal = useMemo(() => {
    const { from, to } = getPeriodRange("year", month, customFrom, customTo);
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= from && d <= to;
    }).reduce((s, e) => s + e.amount, 0);
  }, [expenses, month, customFrom, customTo]);

  const topCategory = useMemo(() => {
    const { from, to } = getPeriodRange(period, month, customFrom, customTo);
    const map = new Map<string, number>();
    for (const e of expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= from && d <= to;
    })) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    if (map.size === 0) return null;
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [expenses, period, month, customFrom, customTo]);

  // ── Month navigation ───────────────────────────────────────────────────────
  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  async function handleSave(data: ExpenseInput) {
    try {
      const created = await api.post<Expense>("/api/admin/expenses", data);
      setExpenses((prev) => [created, ...prev]);
      toast.success("Expense added");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add");
      throw err;
    }
  }

  async function handleEdit(data: ExpenseInput) {
    if (!editing) return;
    try {
      const updated = await api.patch<Expense>(`/api/admin/expenses/${editing.id}`, data);
      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      toast.success("Expense updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/expenses/${deleteTarget.id}`);
      setExpenses((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      toast.success("Expense deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground text-sm">
            Track and manage your business expenses.
          </p>
        </div>
        {!addFormOpen && (
          <Button onClick={() => setAddFormOpen(true)}>
            <Plus className="size-4" /> Add Expense
          </Button>
        )}
      </div>

      {/* Inline add form */}
      {addFormOpen && (
        <InlineAddForm
          parties={parties}
          onSave={handleSave}
          onClose={() => setAddFormOpen(false)}
        />
      )}

      {/* Summary cards — always show fixed period stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Today"
          value={formatCurrency(todayTotal, currency)}
          icon={CalendarDays}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          active={period === "today"}
          onClick={() => setPeriod("today")}
        />
        <SummaryCard
          label="This Week"
          value={formatCurrency(weekTotal, currency)}
          icon={BarChart3}
          accent="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
          active={period === "week"}
          onClick={() => setPeriod("week")}
        />
        <SummaryCard
          label="This Month"
          value={formatCurrency(monthTotal, currency)}
          icon={TrendingDown}
          accent="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          active={period === "month" && month === currentMonthKey()}
          onClick={() => { setPeriod("month"); setMonth(currentMonthKey()); }}
        />
        <SummaryCard
          label="This Year"
          value={formatCurrency(yearTotal, currency)}
          icon={Calendar}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          active={period === "year"}
          onClick={() => setPeriod("year")}
        />
      </div>

      {/* Period filter + search */}
      <div className="space-y-2.5">
        {/* Quick period pills */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {(["today", "yesterday", "week", "month", "lastMonth", "year", "custom"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setPeriod(p); if (p === "month") setMonth(currentMonthKey()); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 border",
                period === p
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <span className="text-muted-foreground/40 px-1 self-center text-xs">|</span>
          <p className="self-center text-xs text-muted-foreground">
            Top: <span className="font-medium text-foreground">{topCategory ?? "—"}</span>
          </p>
          <button
            type="button"
            onClick={() => setShowMoreFilters((v) => !v)}
            className={cn(
              "ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-all duration-150",
              showMoreFilters || activeExtraFilterCount > 0
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            )}
          >
            <Filter className="size-3" /> Filters
            {activeExtraFilterCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                {activeExtraFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Month picker (only for month period) */}
        {period === "month" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category, vendor…"
                className="pl-10 h-11 rounded-full bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
              />
            </div>
            <div className="flex items-center gap-1 rounded-full border bg-card px-2 h-11">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronDown className="size-4 rotate-90" />
              </Button>
              <span className="text-sm font-medium px-1 min-w-28 text-center tabular-nums">
                {periodLabel}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronDown className="size-4 -rotate-90" />
              </Button>
            </div>
            {month !== currentMonthKey() && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setMonth(currentMonthKey())}
              >
                Current
              </Button>
            )}
          </div>
        )}

        {/* Custom date range */}
        {period === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-11 rounded-full w-auto"
              aria-label="From date"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-11 rounded-full w-auto"
              aria-label="To date"
            />
          </div>
        )}

        {/* Search for non-month, non-custom periods (custom shows its own row above) */}
        {period !== "month" && (
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search in ${PERIOD_LABELS[period].toLowerCase()}…`}
              className="pl-10 h-11 rounded-full bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
            />
          </div>
        )}

        {/* More filters: category / payment method / vendor */}
        {showMoreFilters && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 rounded-2xl border bg-card p-3">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? ALL_SENTINEL)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All categories</SelectItem>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v ?? ALL_SENTINEL)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All payment methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All payment methods</SelectItem>
                {EXPENSE_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vendorFilter} onValueChange={(v) => setVendorFilter(v ?? ALL_SENTINEL)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All vendors</SelectItem>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeExtraFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="sm:col-span-3 justify-self-start"
                onClick={() => {
                  setCategoryFilter(ALL_SENTINEL);
                  setPaymentFilter(ALL_SENTINEL);
                  setVendorFilter(ALL_SENTINEL);
                }}
              >
                <X className="size-3.5" /> Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Category breakdown accordion */}
      {filtered.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <CategoryBreakdown expenses={filtered} currency={currency} periodLabel={periodLabel} />
        </div>
      )}

      {/* Expenses list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            expenses.length === 0
              ? "No expenses yet"
              : search || activeExtraFilterCount > 0
              ? "No expenses match your filters"
              : `No expenses for ${periodLabel}`
          }
          description={
            expenses.length === 0
              ? "Start tracking your business expenses to get insights."
              : undefined
          }
          action={
            expenses.length === 0 ? (
              <Button onClick={() => setAddFormOpen(true)}>Add first expense</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="divide-y">
            {filtered.map((expense) => (
              <div
                key={expense.id}
                className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors"
              >
                {/* Date pill */}
                <div className="shrink-0 flex flex-col items-center justify-center rounded-xl bg-muted/60 px-2.5 py-2 min-w-14 text-center">
                  <span className="text-[11px] font-medium text-muted-foreground leading-none uppercase">
                    {new Date(expense.date).toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-tight tabular-nums">
                    {new Date(expense.date).getDate()}
                  </span>
                </div>

                {/* Main info */}
                <div
                  className="flex-1 min-w-0 space-y-1 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/admin/expenses/${expense.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/admin/expenses/${expense.id}`);
                  }}
                >
                  <p className="font-semibold text-sm truncate hover:underline underline-offset-2">
                    {expense.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="text-xs font-normal px-2 py-0 h-5 border-dashed"
                    >
                      {expense.category}
                    </Badge>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        PAYMENT_METHOD_BADGE[expense.paymentMethod] ??
                          "bg-muted text-muted-foreground"
                      )}
                    >
                      {PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
                    </span>
                    {expense.party && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <Building2 className="size-3" /> {expense.party.name}
                      </span>
                    )}
                  </div>
                  {expense.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {expense.notes}
                    </p>
                  )}
                </div>

                {/* Amount + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-bold text-sm tabular-nums">
                    {formatCurrency(expense.amount, currency)}
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg text-muted-foreground",
                        "hover:bg-muted hover:text-foreground transition-colors"
                      )}
                      aria-label="More actions"
                    >
                      <Pencil className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/admin/expenses/${expense.id}`)}>
                        <Eye className="size-4" /> View details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditing(expense)}>
                        <Pencil className="size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(expense)}
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {/* Period total footer */}
          <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">
              {filtered.length} expense{filtered.length !== 1 ? "s" : ""} · {periodLabel}
            </span>
            <span className="text-sm font-bold">
              {formatCurrency(
                filtered.reduce((s, e) => s + e.amount, 0),
                currency
              )}
            </span>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editing && (
        <ExpenseEditDialog
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(null); }}
          initial={editing}
          parties={parties}
          onSave={handleEdit}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete expense?"
        description={`"${deleteTarget?.name}" (${deleteTarget ? formatCurrency(deleteTarget.amount, currency) : ""}) will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
