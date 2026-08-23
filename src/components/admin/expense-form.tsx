"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormRow } from "@/components/shared/form-row";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseInput,
} from "@/lib/validation/expense";

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  type: string;
}

export interface Expense {
  id: string;
  shopId: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: string;
  transactionReference: string | null;
  partyId: string | null;
  party: Vendor | null;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  GPAY: "Google Pay",
  PHONEPE: "PhonePe",
  BANK_TRANSFER: "Bank Transfer",
  DEBIT_CARD: "Debit Card",
  CREDIT_CARD: "Credit Card",
  CARD: "Card",
  BANK: "Bank",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export const PAYMENT_METHOD_BADGE: Record<string, string> = {
  CASH: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  UPI: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  GPAY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PHONEPE: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  BANK_TRANSFER: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  DEBIT_CARD: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  CREDIT_CARD: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  CARD: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  BANK: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  CHEQUE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  OTHER: "bg-muted text-muted-foreground",
};

export interface ExpenseFormData {
  name: string;
  category: string;
  customCategory: string;
  amount: string;
  date: string;
  paymentMethod: string;
  transactionReference: string;
  partyId: string;
  notes: string;
}

export const DEFAULT_EXPENSE_FORM: ExpenseFormData = {
  name: "",
  category: "Miscellaneous",
  customCategory: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  paymentMethod: "CASH",
  transactionReference: "",
  partyId: "",
  notes: "",
};

export function expenseFormFromExisting(expense: Expense): ExpenseFormData {
  const knownCategories = EXPENSE_CATEGORIES as readonly string[];
  const isKnown = knownCategories.includes(expense.category);
  return {
    name: expense.name,
    category: isKnown ? expense.category : "__custom__",
    customCategory: isKnown ? "" : expense.category,
    amount: String(expense.amount),
    date: expense.date.slice(0, 10),
    paymentMethod: expense.paymentMethod,
    transactionReference: expense.transactionReference ?? "",
    partyId: expense.partyId ?? "",
    notes: expense.notes ?? "",
  };
}

export function validateExpenseForm(
  form: ExpenseFormData
): { input: ExpenseInput; errors: null } | { input: null; errors: Partial<Record<keyof ExpenseFormData, string>> } {
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

  if (Object.keys(errs).length > 0) return { input: null, errors: errs };

  return {
    input: {
      name: form.name.trim(),
      category: resolvedCategory,
      amount: amountNum,
      date: new Date(form.date).toISOString(),
      paymentMethod: form.paymentMethod as ExpenseInput["paymentMethod"],
      transactionReference: form.transactionReference.trim() || undefined,
      partyId: form.partyId || null,
      notes: form.notes.trim() || undefined,
    },
    errors: null,
  };
}

// ─── Shared Form Fields (add + edit) ───────────────────────────────────────

export function ExpenseFormFields({
  form,
  errors,
  parties,
  onChange,
}: {
  form: ExpenseFormData;
  errors: Partial<Record<keyof ExpenseFormData, string>>;
  parties: Vendor[];
  onChange: <K extends keyof ExpenseFormData>(key: K, value: ExpenseFormData[K]) => void;
}) {
  const knownCategories = EXPENSE_CATEGORIES as readonly string[];

  // Base UI's <Select.Value> only resolves a selected item's label from an
  // explicit `items` map — without it, it falls back to displaying the raw
  // value (e.g. "GPAY" instead of "Google Pay") once the popup closes.
  const categorySelectItems = useMemo(() => {
    const map: Record<string, string> = { __custom__: "Other (custom)" };
    for (const cat of knownCategories) map[cat] = cat;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vendorSelectItems = useMemo(() => {
    const map: Record<string, string> = { __none__: "No vendor" };
    for (const p of parties) map[p.id] = `${p.name} · ${p.phone}`;
    return map;
  }, [parties]);

  return (
    <div className="space-y-3">
      <FormRow
        label="Expense name"
        htmlFor="exp-name"
        required
        error={errors.name ? { message: errors.name } : undefined}
      >
        <Input
          id="exp-name"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="e.g. Electricity bill, Vegetable purchase"
        />
      </FormRow>

      <FormRow
        label="Category"
        htmlFor="exp-cat"
        required
        error={errors.category ? { message: errors.category } : undefined}
      >
        <Select
          value={form.category}
          onValueChange={(v) => onChange("category", v ?? "")}
          items={categorySelectItems}
        >
          <SelectTrigger id="exp-cat">
            {/* <Select.Value> only resolves a label via the `items` map once
                the popup has been opened at least once in this Base UI
                version — render the label directly instead so it's always
                correct, including on first paint. */}
            <span data-slot="select-value" className="flex flex-1 text-left truncate">
              {categorySelectItems[form.category] ?? "Select category"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {knownCategories.map((cat) => (
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
            onChange={(e) => onChange("customCategory", e.target.value)}
            placeholder="Enter category name"
          />
        </FormRow>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormRow
          label="Amount"
          htmlFor="exp-amount"
          required
          error={errors.amount ? { message: errors.amount } : undefined}
        >
          <Input
            id="exp-amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="0.01"
            value={form.amount}
            onChange={(e) => onChange("amount", e.target.value)}
            placeholder="0.00"
          />
        </FormRow>
        <FormRow
          label="Date"
          htmlFor="exp-date"
          required
          error={errors.date ? { message: errors.date } : undefined}
        >
          <Input
            id="exp-date"
            type="date"
            value={form.date}
            onChange={(e) => onChange("date", e.target.value)}
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
          onValueChange={(v) => onChange("paymentMethod", v ?? "")}
          items={PAYMENT_METHOD_LABELS}
        >
          <SelectTrigger id="exp-pay">
            <span data-slot="select-value" className="flex flex-1 text-left truncate">
              {PAYMENT_METHOD_LABELS[form.paymentMethod] ?? "Select payment method"}
            </span>
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

      <FormRow
        label="Transaction reference (optional)"
        htmlFor="exp-ref"
        error={errors.transactionReference ? { message: errors.transactionReference } : undefined}
      >
        <Input
          id="exp-ref"
          value={form.transactionReference}
          onChange={(e) => onChange("transactionReference", e.target.value)}
          placeholder="UPI/bank txn ID, cheque no.…"
        />
      </FormRow>

      <FormRow
        label="Vendor / supplier (optional)"
        htmlFor="exp-vendor"
        error={errors.partyId ? { message: errors.partyId } : undefined}
      >
        <Select
          value={form.partyId || "__none__"}
          onValueChange={(v) => onChange("partyId", !v || v === "__none__" ? "" : v)}
          items={vendorSelectItems}
        >
          <SelectTrigger id="exp-vendor">
            <span data-slot="select-value" className="flex flex-1 text-left truncate">
              {vendorSelectItems[form.partyId || "__none__"] ?? "No vendor"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No vendor</SelectItem>
            {parties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {p.phone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormRow>

      <FormRow
        label="Notes (optional)"
        htmlFor="exp-notes"
        error={errors.notes ? { message: errors.notes } : undefined}
      >
        <Textarea
          id="exp-notes"
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="Any additional details…"
          className="resize-none"
          rows={2}
        />
      </FormRow>
    </div>
  );
}

// ─── Edit Dialog (shared by the list page and the detail page) ────────────

export function ExpenseEditDialog({
  open,
  onOpenChange,
  initial,
  parties,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Expense;
  parties: Vendor[];
  onSave: (data: ExpenseInput) => Promise<void>;
}) {
  const [form, setForm] = useState<ExpenseFormData>(() => expenseFormFromExisting(initial));
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
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ExpenseFormFields form={form} errors={errors} parties={parties} onChange={onChange} />
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Save changes"}
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
