"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Table2,
  CircleCheck,
  Clock,
  ReceiptText,
  Users,
  Loader2,
  Minus,
  Plus,
  Trash2,
  DoorOpen,
  ChevronDown,
  ChevronUp,
  Phone,
  User,
} from "lucide-react";
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

type OrderItem = {
  id: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
};

type DetailOrder = {
  id: string;
  billNumber: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  createdAt: string;
  items: OrderItem[];
};

type SessionDetail = {
  id: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
  billRequestedAt: string | null;
  orders: DetailOrder[];
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
] as const;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Summary stat card ─────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3 text-center">
      <p className={cn("text-2xl font-bold tabular-nums", accent)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────
export function TablesBoard({ initialTables, currency }: { initialTables: TableBoardEntry[]; currency: string }) {
  const [tables, setTables] = useState(initialTables);
  const [markPaidTarget, setMarkPaidTarget] = useState<TableBoardEntry | null>(null);
  const [detailTarget, setDetailTarget] = useState<TableBoardEntry | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ tables: TableBoardEntry[] }>("/api/admin/table-sessions");
      setTables(res.tables);
    } catch { /* SSE or next manual reload will retry */ }
  }, []);

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: () => refresh(),
    onUpdated: () => refresh(),
    onSessionUpdated: () => refresh(),
  });

  const total = tables.length;
  const available = tables.filter((t) => !t.occupied).length;
  const occupied = tables.filter((t) => t.occupied && t.session?.status === "ACTIVE").length;
  const awaitingPayment = tables.filter((t) => t.session?.status === "AWAITING_PAYMENT").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Tables</h1>
        <p className="text-sm text-muted-foreground">
          {occupied} occupied · {available} available · {awaitingPayment} awaiting payment
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Tables" value={total} />
        <StatCard label="Available" value={available} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Occupied" value={occupied} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Awaiting Payment" value={awaitingPayment} accent="text-violet-600 dark:text-violet-400" />
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
            <TableCard
              key={table.tableNumber}
              table={table}
              currency={currency}
              onMarkPaid={() => setMarkPaidTarget(table)}
              onViewDetail={() => setDetailTarget(table)}
            />
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

      <TableDetailDialog
        table={detailTarget}
        currency={currency}
        onClose={() => setDetailTarget(null)}
        onChanged={() => {
          setDetailTarget(null);
          refresh();
        }}
      />
    </div>
  );
}

// ── Table card ────────────────────────────────────────────────────────────────
function TableCard({
  table,
  currency,
  onMarkPaid,
  onViewDetail,
}: {
  table: TableBoardEntry;
  currency: string;
  onMarkPaid: () => void;
  onViewDetail: () => void;
}) {
  if (!table.occupied || !table.session) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4 space-y-2">
        <p className="text-lg font-bold text-muted-foreground">Table {table.tableNumber}</p>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Available
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
          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {formatTime(session.createdAt)}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>{formatDuration(session.createdAt)}</span>
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", LABEL_BADGE[session.label])}>
          {session.label}
        </span>
      </div>

      <div className="flex items-baseline justify-between border-t pt-2">
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <Users className="size-3.5" /> {session.orderCount} round{session.orderCount !== 1 ? "s" : ""}
        </span>
        <span className="text-xl font-bold tabular-nums text-primary">{formatCurrency(session.grandTotal, currency)}</span>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 h-9 gap-1.5 text-xs" onClick={onViewDetail}>
          <ReceiptText className="size-3.5" /> View Orders
        </Button>
        <Button size="sm" className="flex-1 h-9 gap-1.5 text-xs" onClick={onMarkPaid}>
          <CircleCheck className="size-3.5" /> Mark Paid
        </Button>
      </div>
    </div>
  );
}

// ── Mark Paid dialog ──────────────────────────────────────────────────────────
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
  const [rejecting, setRejecting] = useState(false);

  async function handleReject() {
    if (!table?.session) return;
    setRejecting(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, { action: "reject_payment" });
      toast.success(`Payment rejected — table ${table.tableNumber} back to ordering`);
      onPaid();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reject this payment");
    } finally {
      setRejecting(false);
    }
  }

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

        <DialogFooter className="sm:justify-between">
          {table?.session?.status === "AWAITING_PAYMENT" && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleReject}
              disabled={submitting || rejecting}
            >
              {rejecting ? "Rejecting…" : "Reject Payment"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting || rejecting}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={submitting || rejecting}>
              {submitting ? "Saving…" : "Confirm payment"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Table detail dialog ───────────────────────────────────────────────────────
function TableDetailDialog({
  table,
  currency,
  onClose,
  onChanged,
}: {
  table: TableBoardEntry | null;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseNote, setReleaseNote] = useState("");
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [payMethod, setPayMethod] = useState<(typeof PAYMENT_METHODS)[number]["value"]>("CASH");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [rejectingPayment, setRejectingPayment] = useState(false);

  const open = !!table;

  // Fetch detail when dialog opens
  async function loadDetail(sessionId: string) {
    setLoading(true);
    setError(false);
    setDetail(null);
    setExpandedOrder(null);
    setEditingOrder(null);
    setShowReleaseConfirm(false);
    setShowPayConfirm(false);
    try {
      const data = await api.get<SessionDetail>(`/api/admin/table-sessions/${sessionId}`);
      setDetail(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      setDetail(null);
    }
  }

  // Clears stale detail once the dialog closes, however it closed — adjusted
  // during render (not an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setDetail(null);
  }

  // Load detail whenever the dialog opens or the session changes.
  useEffect(() => {
    if (!open || !table?.session?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail(table.session.id);
    // loadDetail only uses stable setState setters + api (module-level), safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, table?.session?.id]);

  // All non-cancelled items merged for the summary view
  const mergedItems = detail
    ? (() => {
        const map = new Map<string, { name: string; price: number; quantity: number }>();
        detail.orders
          .filter((o) => o.status !== "CANCELLED")
          .flatMap((o) => o.items)
          .forEach((item) => {
            const key = item.productId ?? item.name;
            const existing = map.get(key);
            if (existing) {
              map.set(key, { ...existing, quantity: existing.quantity + item.quantity });
            } else {
              map.set(key, { name: item.name, price: item.price, quantity: item.quantity });
            }
          });
        return Array.from(map.values());
      })()
    : [];

  const sessionTotal = mergedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function startEditOrder(order: DetailOrder) {
    const qty: Record<string, number> = {};
    order.items.forEach((item) => { qty[item.id] = item.quantity; });
    setEditQuantities(qty);
    setEditingOrder(order.id);
  }

  async function saveEditOrder(orderId: string) {
    setSavingEdit(true);
    try {
      const updates = Object.entries(editQuantities).map(([id, quantity]) => ({ id, quantity }));
      await api.patch(`/api/admin/orders/${orderId}`, { action: "edit_items", items: updates });
      toast.success("Order updated");
      setEditingOrder(null);
      if (table?.session) await loadDetail(table.session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update order");
    } finally {
      setSavingEdit(false);
    }
  }

  async function cancelOrder(orderId: string) {
    try {
      await api.patch(`/api/admin/orders/${orderId}`, { action: "status", status: "CANCELLED" });
      toast.success("Order cancelled");
      if (table?.session) await loadDetail(table.session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel order");
    }
  }

  async function handleRelease() {
    if (!table?.session) return;
    setReleasing(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, {
        action: "release_table",
        paymentNote: releaseNote.trim() || undefined,
      });
      toast.success(`Table ${table.tableNumber} released`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't release table");
    } finally {
      setReleasing(false);
    }
  }

  async function handleRejectPayment() {
    if (!table?.session) return;
    setRejectingPayment(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, { action: "reject_payment" });
      toast.success(`Payment rejected — table ${table.tableNumber} back to ordering`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reject this payment");
    } finally {
      setRejectingPayment(false);
    }
  }

  async function handleMarkPaid() {
    if (!table?.session) return;
    setPaying(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, {
        action: "mark_paid",
        paymentMethod: payMethod,
        paymentNote: payNote.trim() || undefined,
      });
      toast.success(`Table ${table.tableNumber} marked as paid`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't mark as paid");
    } finally {
      setPaying(false);
    }
  }

  const isClosed = detail?.status === "PAID";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Table2 className="size-4 text-primary" />
              Table {table?.tableNumber}
            </span>
            {detail && (
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
                detail.status === "ACTIVE" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                detail.status === "AWAITING_PAYMENT" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}>
                {detail.status === "ACTIVE" ? "Active" : detail.status === "AWAITING_PAYMENT" ? "Awaiting Payment" : "Paid"}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-center py-10 text-sm text-destructive">
              Couldn&apos;t load table details.{" "}
              <button className="underline" onClick={() => table?.session && loadDetail(table.session.id)}>
                Retry
              </button>
            </div>
          )}

          {detail && (
            <>
              {/* Customer info */}
              {(detail.customerName || detail.customerPhone) && (
                <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-1.5 text-sm">
                  {detail.customerName && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="size-3.5" /> <span>{detail.customerName}</span>
                    </div>
                  )}
                  {detail.customerPhone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5" /> <span>{detail.customerPhone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Time info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" /> Opened at {formatTime(detail.createdAt)}
                </span>
                <span>{formatDuration(detail.createdAt)} ago</span>
              </div>

              {/* Summary of all items */}
              <div className="rounded-xl border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  All Items Ordered
                </div>
                <div className="divide-y">
                  {mergedItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="font-medium">{item.name} <span className="text-muted-foreground font-normal">× {item.quantity}</span></span>
                      <span className="font-semibold tabular-nums">{formatCurrency(item.price * item.quantity, currency)}</span>
                    </div>
                  ))}
                  {mergedItems.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No active items.</p>
                  )}
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10 font-bold text-sm">
                  <span>Total</span>
                  <span className="text-primary text-base tabular-nums">{formatCurrency(sessionTotal, currency)}</span>
                </div>
              </div>

              {/* Individual orders */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orders ({detail.orders.length})</p>
                {detail.orders.map((order, idx) => (
                  <div key={order.id} className={cn("rounded-xl border overflow-hidden", order.status === "CANCELLED" && "opacity-50")}>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    >
                      <div>
                        <p className="text-sm font-semibold">Round {idx + 1} — {order.billNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)} · {order.status}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-sm">{formatCurrency(order.grandTotal, currency)}</span>
                        {expandedOrder === order.id ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {expandedOrder === order.id && (
                      <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
                        {/* Items list */}
                        <div className="space-y-2">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="flex-1 font-medium">{item.name}</span>
                              {editingOrder === order.id ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    className="flex size-6 items-center justify-center rounded-full bg-muted hover:bg-muted/80"
                                    onClick={() => setEditQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] ?? item.quantity) - 1) }))}
                                  >
                                    <Minus className="size-3" />
                                  </button>
                                  <span className="w-6 text-center tabular-nums font-semibold">
                                    {editQuantities[item.id] ?? item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    className="flex size-6 items-center justify-center rounded-full bg-muted hover:bg-muted/80"
                                    onClick={() => setEditQuantities((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? item.quantity) + 1 }))}
                                  >
                                    <Plus className="size-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="tabular-nums text-muted-foreground">× {item.quantity}</span>
                              )}
                              <span className="font-semibold tabular-nums w-20 text-right">
                                {formatCurrency(
                                  item.price * (editingOrder === order.id ? (editQuantities[item.id] ?? item.quantity) : item.quantity),
                                  currency
                                )}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Order actions */}
                        {order.status !== "CANCELLED" && !isClosed && (
                          <div className="flex gap-2 pt-1 border-t">
                            {editingOrder === order.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-8 text-xs"
                                  onClick={() => setEditingOrder(null)}
                                  disabled={savingEdit}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1 h-8 text-xs"
                                  onClick={() => saveEditOrder(order.id)}
                                  disabled={savingEdit}
                                >
                                  {savingEdit ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-8 text-xs gap-1"
                                  onClick={() => startEditOrder(order)}
                                >
                                  <Minus className="size-3" /> Edit Items
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={() => cancelOrder(order.id)}
                                >
                                  <Trash2 className="size-3" /> Cancel Order
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Mark Paid */}
              {!isClosed && (
                <>
                  {showPayConfirm ? (
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <p className="text-sm font-semibold">Confirm Payment — Table {table?.tableNumber}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => setPayMethod(m.value)}
                            className={cn(
                              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                              payMethod === m.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <Textarea placeholder="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} rows={2} />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setShowPayConfirm(false)} disabled={paying}>Cancel</Button>
                        <Button className="flex-1 gap-1.5" onClick={handleMarkPaid} disabled={paying}>
                          {paying ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
                          Confirm Paid
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full h-11 gap-1.5"
                      onClick={() => setShowPayConfirm(true)}
                    >
                      <CircleCheck className="size-4" /> Mark as Paid
                    </Button>
                  )}

                  {detail?.status === "AWAITING_PAYMENT" && !showPayConfirm && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full h-11 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleRejectPayment}
                      disabled={rejectingPayment}
                    >
                      {rejectingPayment ? <Loader2 className="size-4 animate-spin" /> : null}
                      {rejectingPayment ? "Rejecting…" : "Reject Payment"}
                    </Button>
                  )}

                  {/* Release Table */}
                  {showReleaseConfirm ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                      <p className="text-sm font-semibold text-destructive">Release Table {table?.tableNumber}?</p>
                      <p className="text-xs text-muted-foreground">This will void all charges and mark the table as available. Use this for abandoned or mis-scanned tables.</p>
                      <Textarea placeholder="Reason (optional)" value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} rows={2} />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setShowReleaseConfirm(false)} disabled={releasing}>Cancel</Button>
                        <Button variant="destructive" className="flex-1 gap-1.5" onClick={handleRelease} disabled={releasing}>
                          {releasing ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4" />}
                          Release Table
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full h-11 gap-1.5 text-muted-foreground"
                      onClick={() => setShowReleaseConfirm(true)}
                    >
                      <DoorOpen className="size-4" /> Release Table (Void)
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
