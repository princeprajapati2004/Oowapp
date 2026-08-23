"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Tag,
  CalendarDays,
  Wallet,
  Hash,
  Building2,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  ExpenseEditDialog,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_BADGE,
  type Expense,
  type Vendor,
} from "@/components/admin/expense-form";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { ExpenseInput } from "@/lib/validation/expense";

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Tag;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium mt-0.5">{children}</div>
      </div>
    </div>
  );
}

export function ExpenseDetail({
  initialExpense,
  parties,
  currency,
}: {
  initialExpense: Expense;
  parties: Vendor[];
  currency: string;
}) {
  const router = useRouter();
  const [expense, setExpense] = useState(initialExpense);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleEdit(data: ExpenseInput) {
    try {
      const updated = await api.patch<Expense>(`/api/admin/expenses/${expense.id}`, data);
      setExpense(updated);
      toast.success("Expense updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
      throw err;
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/api/admin/expenses/${expense.id}`);
      toast.success("Expense deleted");
      router.push("/admin/expenses");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete");
      setDeleteOpen(false);
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/expenses"
          className="flex size-9 items-center justify-center rounded-xl border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          aria-label="Back to expenses"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight truncate">{expense.name}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(expense.date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} aria-label="Edit">
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Amount */}
      <div className="rounded-2xl border bg-card p-5 text-center">
        <p className="text-xs text-muted-foreground">Amount</p>
        <p className="text-3xl font-bold tracking-tight mt-1">
          {formatCurrency(expense.amount, currency)}
        </p>
      </div>

      {/* Details */}
      <div className="rounded-2xl border bg-card px-4 divide-y">
        <DetailRow icon={Tag} label="Category">
          <Badge variant="outline" className="font-normal border-dashed">
            {expense.category}
          </Badge>
        </DetailRow>

        <DetailRow icon={Wallet} label="Payment method">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              PAYMENT_METHOD_BADGE[expense.paymentMethod] ?? "bg-muted text-muted-foreground"
            )}
          >
            {PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
          </span>
        </DetailRow>

        {expense.transactionReference && (
          <DetailRow icon={Hash} label="Transaction reference">
            {expense.transactionReference}
          </DetailRow>
        )}

        {expense.party && (
          <DetailRow icon={Building2} label="Vendor / supplier">
            <Link
              href={`/admin/parties/${expense.party.id}`}
              className="text-primary hover:underline"
            >
              {expense.party.name} · {expense.party.phone}
            </Link>
          </DetailRow>
        )}

        <DetailRow icon={CalendarDays} label="Logged on">
          {new Date(expense.createdAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </DetailRow>

        {expense.notes && (
          <DetailRow icon={StickyNote} label="Notes">
            <p className="font-normal text-muted-foreground whitespace-pre-wrap">
              {expense.notes}
            </p>
          </DetailRow>
        )}
      </div>

      {editOpen && (
        <ExpenseEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={expense}
          parties={parties}
          onSave={handleEdit}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete expense?"
        description={`"${expense.name}" (${formatCurrency(expense.amount, currency)}) will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
