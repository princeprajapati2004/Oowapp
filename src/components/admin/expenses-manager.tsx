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
import { presetToDateStrings, resolveDateRange } from "@/lib/utils/date-range";
import { ExpenseDateFilter, type ExpenseDateFilterValue } from "@/components/admin/expenses/expense-date-filter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THIS_MONTH_FILTER: ExpenseDateFilterValue = { preset: "this_month", ...presetToDateStrings("this_month") };

const ALL_SENTINEL = "__all__";
const PAGE_SIZE = 50;

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

type ExpenseSearchResponse = {
  expenses: Expense[];
  total: number;
  totalAmount: number;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string } | null;
};

export function ExpensesManager({
  initialExpenses,
  initialTotal,
  initialTotalAmount,
  initialQuickTotals,
  parties,
  currency,
}: {
  initialExpenses: Expense[];
  initialTotal: number;
  initialTotalAmount: number;
  initialQuickTotals: { today: number; week: number; month: number; year: number };
  parties: Vendor[];
  currency: string;
}) {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [total, setTotal] = useState(initialTotal);
  const [totalAmount, setTotalAmount] = useState(initialTotalAmount);
  const [quickTotals, setQuickTotals] = useState(initialQuickTotals);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<ExpenseDateFilterValue>(THIS_MONTH_FILTER);
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

  // Debounce the search box only — filter buttons/date presets apply immediately.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const activeExtraFilterCount =
    (categoryFilter !== ALL_SENTINEL ? 1 : 0) +
    (paymentFilter !== ALL_SENTINEL ? 1 : 0) +
    (vendorFilter !== ALL_SENTINEL ? 1 : 0);

  const periodLabel = useMemo(() => {
    if (dateFilter.preset === "all" || !dateFilter.from || !dateFilter.to) return "All Time";
    return resolveDateRange(dateFilter.from, dateFilter.to).label;
  }, [dateFilter]);

  function buildQueryParams(targetPage: number): URLSearchParams {
    const params = new URLSearchParams();
    if (dateFilter.preset !== "all" && dateFilter.from && dateFilter.to) {
      params.set("from", dateFilter.from);
      params.set("to", dateFilter.to);
    }
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (categoryFilter !== ALL_SENTINEL) params.set("category", categoryFilter);
    if (paymentFilter !== ALL_SENTINEL) params.set("paymentMethod", paymentFilter);
    if (vendorFilter !== ALL_SENTINEL) params.set("partyId", vendorFilter);
    params.set("page", String(targetPage));
    params.set("pageSize", String(PAGE_SIZE));
    return params;
  }

  async function runSearch() {
    setLoading(true);
    try {
      const result = await api.get<ExpenseSearchResponse>(`/api/admin/expenses?${buildQueryParams(1).toString()}`);
      setExpenses(result.expenses);
      setTotal(result.total);
      setTotalAmount(result.totalAmount);
      setPage(1);
    } catch {
      toast.error("Couldn't load expenses");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await api.get<ExpenseSearchResponse>(`/api/admin/expenses?${buildQueryParams(nextPage).toString()}`);
      setExpenses((prev) => [...prev, ...result.expenses]);
      setTotal(result.total);
      setTotalAmount(result.totalAmount);
      setPage(nextPage);
    } catch {
      toast.error("Couldn't load more expenses");
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshQuickTotals() {
    try {
      const totals = await api.get<{ today: number; week: number; month: number; year: number }>(
        "/api/admin/expenses/quick-totals"
      );
      setQuickTotals(totals);
    } catch {
      // Non-critical — the fixed summary cards just keep showing the last-known figures.
    }
  }

  // Server round-trip on every filter change — first paint already matches
  // THIS_MONTH_FILTER via SSR, so this intentionally re-fires once on mount
  // too (a cheap, harmless no-op refetch) rather than adding a fragile
  // "skip the first run" guard across two independent effects.
  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, debouncedSearch, categoryFilter, paymentFilter, vendorFilter]);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  // Each mutation re-runs the current server search + quick-totals rather
  // than patching the local page in place — the new/edited/deleted row may
  // no longer belong on the active filtered page (e.g. it moved outside the
  // selected date range), so a full refetch is the only way to keep the
  // list, total, and totalAmount consistent with what the server actually has.
  async function handleSave(data: ExpenseInput) {
    try {
      await api.post<Expense>("/api/admin/expenses", data);
      toast.success("Expense added");
      await Promise.all([runSearch(), refreshQuickTotals()]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add");
      throw err;
    }
  }

  async function handleEdit(data: ExpenseInput) {
    if (!editing) return;
    try {
      await api.patch<Expense>(`/api/admin/expenses/${editing.id}`, data);
      toast.success("Expense updated");
      await Promise.all([runSearch(), refreshQuickTotals()]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/expenses/${deleteTarget.id}`);
      toast.success("Expense deleted");
      await Promise.all([runSearch(), refreshQuickTotals()]);
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

      {/* Summary cards — always show fixed period stats, independent of the active filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Today"
          value={formatCurrency(quickTotals.today, currency)}
          icon={CalendarDays}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          active={dateFilter.preset === "today"}
          onClick={() => setDateFilter({ preset: "today", ...presetToDateStrings("today") })}
        />
        <SummaryCard
          label="This Week"
          value={formatCurrency(quickTotals.week, currency)}
          icon={BarChart3}
          accent="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
          active={dateFilter.preset === "this_week"}
          onClick={() => setDateFilter({ preset: "this_week", ...presetToDateStrings("this_week") })}
        />
        <SummaryCard
          label="This Month"
          value={formatCurrency(quickTotals.month, currency)}
          icon={TrendingDown}
          accent="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          active={dateFilter.preset === "this_month"}
          onClick={() => setDateFilter({ preset: "this_month", ...presetToDateStrings("this_month") })}
        />
        <SummaryCard
          label="This Year"
          value={formatCurrency(quickTotals.year, currency)}
          icon={Calendar}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          active={dateFilter.preset === "year"}
          onClick={() => setDateFilter({ preset: "year", ...presetToDateStrings("this_year") })}
        />
      </div>

      {/* Filter bar: [ Search ] [ 📅 date filter ] [ Filters ] */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, category, vendor…"
              className="pl-10 h-11 rounded-full bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
            />
          </div>
          <ExpenseDateFilter value={dateFilter} onChange={setDateFilter} />
          <button
            type="button"
            onClick={() => setShowMoreFilters((v) => !v)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium border transition-all duration-150",
              showMoreFilters || activeExtraFilterCount > 0
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            )}
            aria-label="More filters"
          >
            <Filter className="size-3.5" />
            {activeExtraFilterCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                {activeExtraFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Selected range, shown clearly */}
        {dateFilter.preset !== "all" && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Calendar className="size-3.5" /> {periodLabel}
          </p>
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

      {/* Category breakdown accordion — approximated from the currently loaded page(s) */}
      {expenses.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <CategoryBreakdown expenses={expenses} currency={currency} periodLabel={periodLabel} />
        </div>
      )}

      {/* Expenses list */}
      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : total === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            debouncedSearch || activeExtraFilterCount > 0 || dateFilter.preset !== "all"
              ? "No expenses match your filters"
              : "No expenses yet"
          }
          description={
            debouncedSearch || activeExtraFilterCount > 0
              ? undefined
              : "Start tracking your business expenses to get insights."
          }
          action={<Button onClick={() => setAddFormOpen(true)}>Add expense</Button>}
        />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="divide-y">
            {expenses.map((expense) => (
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

          {expenses.length < total && (
            <div className="flex justify-center border-t p-3">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Load more (${total - expenses.length} more)`}
              </Button>
            </div>
          )}

          {/* Total Expenses / Number of Expenses for the selected filter */}
          <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">
              {total} expense{total !== 1 ? "s" : ""} · {periodLabel}
            </span>
            <span className="text-sm font-bold">{formatCurrency(totalAmount, currency)}</span>
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
