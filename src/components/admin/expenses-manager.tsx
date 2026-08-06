"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Receipt,
  TrendingDown,
  CalendarDays,
  Tag,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
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
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseInput,
} from "@/lib/validation/expense";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Expense {
  id: string;
  shopId: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthKey(iso: string) {
  return iso.slice(0, 7); // "2026-08"
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK: "Bank",
};

const PAYMENT_METHOD_BADGE: Record<string, string> = {
  CASH: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  UPI: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  CARD: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  BANK: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

// ─── Expense Dialog ───────────────────────────────────────────────────────────

interface ExpenseFormData {
  name: string;
  category: string;
  customCategory: string;
  amount: string;
  date: string;
  paymentMethod: string;
  notes: string;
}

const DEFAULT_FORM: ExpenseFormData = {
  name: "",
  category: "Miscellaneous",
  customCategory: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  paymentMethod: "CASH",
  notes: "",
};

function ExpenseDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Expense | null;
  onSave: (data: ExpenseInput) => Promise<void>;
}) {
  const isEdit = !!initial;
  const knownCategories = EXPENSE_CATEGORIES as readonly string[];

  const [form, setForm] = useState<ExpenseFormData>(() => {
    if (initial) {
      const isKnown = knownCategories.includes(initial.category);
      return {
        name: initial.name,
        category: isKnown ? initial.category : "__custom__",
        customCategory: isKnown ? "" : initial.category,
        amount: String(initial.amount),
        date: initial.date.slice(0, 10),
        paymentMethod: initial.paymentMethod,
        notes: initial.notes ?? "",
      };
    }
    return { ...DEFAULT_FORM };
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseFormData, string>>>({});

  function set<K extends keyof ExpenseFormData>(key: K, value: ExpenseFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): ExpenseInput | null {
    const errs: Partial<Record<keyof ExpenseFormData, string>> = {};

    if (!form.name.trim()) errs.name = "Name is required";
    const resolvedCategory =
      form.category === "__custom__" ? form.customCategory.trim() : form.category;
    if (!resolvedCategory) errs.customCategory = "Category is required";

    const amountNum = parseFloat(form.amount);
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) {
      errs.amount = "Enter a valid positive amount";
    }
    if (!form.date) errs.date = "Date is required";
    if (!form.paymentMethod) errs.paymentMethod = "Payment method is required";

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return null;
    }

    return {
      name: form.name.trim(),
      category: resolvedCategory,
      amount: amountNum,
      date: new Date(form.date).toISOString(),
      paymentMethod: form.paymentMethod as ExpenseInput["paymentMethod"],
      notes: form.notes.trim() || undefined,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = validate();
    if (!input) return;
    setSaving(true);
    try {
      await onSave(input);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  // Reset form when dialog opens for a new expense
  function handleOpenChange(v: boolean) {
    if (!v) {
      onOpenChange(false);
      return;
    }
    onOpenChange(true);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormRow label="Expense name" htmlFor="exp-name" required error={errors.name ? { message: errors.name } : undefined}>
            <Input
              id="exp-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Electricity bill, Vegetable purchase"
            />
          </FormRow>

          <FormRow label="Category" htmlFor="exp-cat" required error={errors.category ? { message: errors.category } : undefined}>
            <Select value={form.category} onValueChange={(v) => set("category", v ?? "")}>
              <SelectTrigger id="exp-cat">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Other (custom)</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          {form.category === "__custom__" && (
            <FormRow
              label="Custom category"
              htmlFor="exp-custom-cat"
              required
              error={errors.customCategory ? { message: errors.customCategory } : undefined}
            >
              <Input
                id="exp-custom-cat"
                value={form.customCategory}
                onChange={(e) => set("customCategory", e.target.value)}
                placeholder="Enter category name"
              />
            </FormRow>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Amount" htmlFor="exp-amount" required error={errors.amount ? { message: errors.amount } : undefined}>
              <Input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0.00"
              />
            </FormRow>
            <FormRow label="Date" htmlFor="exp-date" required error={errors.date ? { message: errors.date } : undefined}>
              <Input
                id="exp-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </FormRow>
          </div>

          <FormRow
            label="Payment method"
            htmlFor="exp-pay"
            required
            error={errors.paymentMethod ? { message: errors.paymentMethod } : undefined}
          >
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => set("paymentMethod", v ?? "")}
            >
              <SelectTrigger id="exp-pay">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Notes (optional)" htmlFor="exp-notes" error={errors.notes ? { message: errors.notes } : undefined}>
            <Textarea
              id="exp-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional details…"
              className="resize-none"
              rows={2}
            />
          </FormRow>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn("flex size-8 items-center justify-center rounded-xl", accent)}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Category Breakdown Accordion ────────────────────────────────────────────

function CategoryBreakdown({
  expenses,
  currency,
}: {
  expenses: Expense[];
  currency: string;
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
          Monthly category breakdown
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
  currency,
}: {
  initialExpenses: Expense[];
  currency: string;
}) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(currentMonthKey());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  // ── Filtered view ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchesMonth = toMonthKey(e.date) === month;
      const matchesSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q);
      return matchesMonth && matchesSearch;
    });
  }, [expenses, search, month]);

  // ── Summary calculations ───────────────────────────────────────────────────
  const todayTotal = useMemo(() => {
    const today = todayKey();
    return expenses
      .filter((e) => e.date.slice(0, 10) === today)
      .reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const monthTotal = useMemo(
    () => expenses.filter((e) => toMonthKey(e.date) === month).reduce((s, e) => s + e.amount, 0),
    [expenses, month]
  );

  const topCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses.filter((e) => toMonthKey(e.date) === month)) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    if (map.size === 0) return null;
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [expenses, month]);

  // ── Month navigation helpers ───────────────────────────────────────────────
  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }, [month]);

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setDialogOpen(true);
  }

  async function handleSave(data: ExpenseInput) {
    if (editing) {
      try {
        const updated = await api.patch<Expense>(
          `/api/admin/expenses/${editing.id}`,
          data
        );
        setExpenses((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e))
        );
        toast.success("Expense updated");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Failed to update");
        throw err;
      }
    } else {
      try {
        const created = await api.post<Expense>("/api/admin/expenses", data);
        setExpenses((prev) => [created, ...prev]);
        toast.success("Expense added");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Failed to add");
        throw err;
      }
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
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add Expense
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Today's expenses"
          value={formatCurrency(todayTotal, currency)}
          icon={CalendarDays}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <SummaryCard
          label="This month's total"
          value={formatCurrency(monthTotal, currency)}
          sub={monthLabel}
          icon={TrendingDown}
          accent="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        />
        <SummaryCard
          label="Top category"
          value={topCategory ?? "—"}
          sub={topCategory ? "Highest spend this month" : "No expenses yet"}
          icon={Tag}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>

      {/* Search + month filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or category…"
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
            {monthLabel}
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
            Today
          </Button>
        )}
      </div>

      {/* Category breakdown accordion */}
      {filtered.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <CategoryBreakdown expenses={filtered} currency={currency} />
        </div>
      )}

      {/* Expenses list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            expenses.length === 0
              ? "No expenses yet"
              : search
              ? "No expenses match your search"
              : `No expenses in ${monthLabel}`
          }
          description={
            expenses.length === 0
              ? "Start tracking your business expenses to get insights."
              : undefined
          }
          action={
            expenses.length === 0 ? (
              <Button onClick={openCreate}>Add first expense</Button>
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
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-sm truncate">{expense.name}</p>
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
                      <DropdownMenuItem onClick={() => openEdit(expense)}>
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

          {/* Month total footer */}
          <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">
              {filtered.length} expense{filtered.length !== 1 ? "s" : ""} · {monthLabel}
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

      {/* Add/Edit dialog */}
      {dialogOpen && (
        <ExpenseDialog
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) setEditing(null);
          }}
          initial={editing}
          onSave={handleSave}
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
