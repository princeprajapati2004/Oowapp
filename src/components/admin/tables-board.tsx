"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Table2, CircleCheck, Clock, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { useOrderEvents } from "@/lib/hooks/use-order-events";

type SessionLabel = "Preparing" | "Served" | "Awaiting payment" | "Paid";

type TableBoardEntry = {
  tableNumber: string;
  occupied: boolean;
  session: {
    id: string;
    status: string;
    label: SessionLabel;
    orderCount: number;
    grandTotal: number;
    createdAt: string;
    billRequestedAt: string | null;
  } | null;
};

const LABEL_BADGE: Record<SessionLabel, string> = {
  Preparing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Served: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Awaiting payment": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
  { value: "VOID", label: "Void (no charge)" },
] as const;

export function TablesBoard({ initialTables, currency }: { initialTables: TableBoardEntry[]; currency: string }) {
  const [tables, setTables] = useState(initialTables);
  const [markPaidTarget, setMarkPaidTarget] = useState<TableBoardEntry | null>(null);

  async function refresh() {
    try {
      const res = await api.get<{ tables: TableBoardEntry[] }>("/api/admin/table-sessions");
      setTables(res.tables);
    } catch {
      // Next SSE event or manual reload will retry — no need to surface this.
    }
  }

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: () => refresh(),
    onUpdated: () => refresh(),
    onSessionUpdated: () => refresh(),
  });

  const occupied = tables.filter((t) => t.occupied);
  const vacant = tables.filter((t) => !t.occupied);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Tables</h1>
        <p className="text-sm text-muted-foreground">
          {occupied.length} occupied · {vacant.length} vacant
        </p>
      </div>

      {tables.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="No tables configured"
          description="Add table names in Settings to start using the Tables board."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => (
            <TableCard key={table.tableNumber} table={table} currency={currency} onMarkPaid={() => setMarkPaidTarget(table)} />
          ))}
        </div>
      )}

      <MarkPaidDialog
        table={markPaidTarget}
        currency={currency}
        onClose={() => setMarkPaidTarget(null)}
        onPaid={() => {
          setMarkPaidTarget(null);
          refresh();
        }}
      />
    </div>
  );
}

function TableCard({
  table,
  currency,
  onMarkPaid,
}: {
  table: TableBoardEntry;
  currency: string;
  onMarkPaid: () => void;
}) {
  if (!table.occupied || !table.session) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4 space-y-2">
        <p className="text-lg font-bold text-muted-foreground">Table {table.tableNumber}</p>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Vacant
        </span>
      </div>
    );
  }

  const { session } = table;
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">Table {table.tableNumber}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" /> {session.orderCount} order{session.orderCount !== 1 ? "s" : ""}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", LABEL_BADGE[session.label])}>
          {session.label}
        </span>
      </div>

      <div className="flex items-baseline justify-between border-t pt-2">
        <span className="text-sm font-medium text-muted-foreground">Running total</span>
        <span className="text-xl font-bold tabular-nums text-primary">{formatCurrency(session.grandTotal, currency)}</span>
      </div>

      <Button size="lg" className="h-10 w-full gap-1.5" onClick={onMarkPaid}>
        <CircleCheck className="size-4" /> Mark as Paid
      </Button>
    </div>
  );
}

function MarkPaidDialog({
  table,
  currency,
  onClose,
  onPaid,
}: {
  table: TableBoardEntry | null;
  currency: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]["value"]>("CASH");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!table?.session) return;
    setSubmitting(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, {
        action: "mark_paid",
        paymentMethod: method,
        paymentNote: note.trim() || undefined,
      });
      toast.success(`Table ${table.tableNumber} marked as paid`);
      setNote("");
      setMethod("CASH");
      onPaid();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't mark this table as paid");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!table} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="size-4 text-primary" /> Mark Table {table?.tableNumber} as Paid
          </DialogTitle>
        </DialogHeader>

        {table?.session && (
          <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Amount due</span>
            <span className="font-bold">{formatCurrency(table.session.grandTotal, currency)}</span>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment method</p>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  method === m.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Saving…" : "Confirm payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
