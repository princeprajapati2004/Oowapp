"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  Search,
  CircleCheck,
  CreditCard,
  Printer,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { toBillOrderData, type BillShopData } from "@/lib/hooks/use-bill-actions";
import { printBill } from "@/lib/printing/print-service";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PAYMENT_LABELS,
  PAYMENT_BADGE_CLASS,
  getNextStatus,
  deriveOrderType,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";
import { getPayableTotal } from "@/lib/services/billing";
import { OrderPaymentModal } from "@/components/admin/orders/order-payment-modal";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";

// Everything short of Completed/Cancelled is actionable at the counter —
// payment can be recorded at any point, and Mark Complete becomes available
// once getNextStatus() says COMPLETED is the next step (immediately for
// dine-in/takeaway once Ready; only after Delivered for delivery orders —
// see statusFlow() in order-status.ts). Table-session orders are settled as
// a whole tab via the Tables board instead (see the dedicated section
// below) so staff can't double-book the same payment through two flows.
const ACTIONABLE_STATUSES = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);

function matchesQuery(order: AdminOrderEventOrder, query: string) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    order.billNumber.toLowerCase().includes(q) ||
    (order.customerName ?? "").toLowerCase().includes(q) ||
    (order.tableNumber ?? "").toLowerCase().includes(q)
  );
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", PAYMENT_BADGE_CLASS[status])}>
      {PAYMENT_LABELS[status]}
    </span>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE_CLASS[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function OrderCounterCard({
  order,
  currency,
  shop,
  updating,
  printing,
  onRecordPayment,
  onComplete,
  onPrint,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  shop: BillShopData;
  updating: boolean;
  printing: boolean;
  onRecordPayment: (order: AdminOrderEventOrder) => void;
  onComplete: (order: AdminOrderEventOrder) => void;
  onPrint: (order: AdminOrderEventOrder) => void;
}) {
  void shop;
  const status = order.status as OrderStatus;
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const total = getPayableTotal(order);
  const paid = order.paidAmount ?? 0;
  const balanceDue = Math.max(0, total - paid);
  const { date, dayTime } = formatOrderDateParts(order.createdAt);
  const orderType = deriveOrderType(order);
  const canComplete = getNextStatus({ ...order, status }) === "COMPLETED";

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{order.billNumber}</p>
          <p className="truncate text-lg font-bold">
            {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in Customer"}
          </p>
          {order.customerPhone && <p className="text-xs text-muted-foreground">{order.customerPhone}</p>}
          <p className="text-xs text-muted-foreground">
            {orderType} · {date} · {dayTime}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={status} />
          <PaymentBadge status={paymentStatus} />
        </div>
      </div>

      <div className="space-y-1 border-t pt-2 text-sm text-muted-foreground">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2">
            <span className="truncate">
              {item.name} × {item.quantity}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-2.5 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-sm font-semibold">{formatCurrency(total, currency)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid</p>
          <p className="text-sm font-semibold">{formatCurrency(paid, currency)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</p>
          <p className={cn("text-sm font-semibold", balanceDue > 0 && "text-amber-600 dark:text-amber-400")}>
            {formatCurrency(balanceDue, currency)}
          </p>
        </div>
      </div>
      {paid > 0 && order.paymentMethod && (
        <p className="text-xs text-muted-foreground">
          Last payment via <span className="font-medium text-foreground">{order.paymentMethod}</span>
          {order.transactionReference ? ` · Ref ${order.transactionReference}` : ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-3">
        {paymentStatus !== "PAID" && (
          <Button size="sm" className="gap-1.5" disabled={updating} onClick={() => onRecordPayment(order)}>
            <CreditCard className="size-3.5" /> Record Payment
          </Button>
        )}
        {canComplete && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={updating} onClick={() => onComplete(order)}>
            {updating ? <Loader2 className="size-3.5 animate-spin" /> : <CircleCheck className="size-3.5" />}
            Mark Complete
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" disabled={printing} onClick={() => onPrint(order)}>
          {printing ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
          Print Receipt
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto gap-1.5" render={<Link href={`/admin/orders/${order.id}`} />}>
          View Order <ExternalLink className="size-3.5" />
        </Button>
      </div>

      {canComplete && balanceDue > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Balance of {formatCurrency(balanceDue, currency)} still due — completing won&apos;t mark it paid.
        </p>
      )}
    </div>
  );
}

function CompletedRow({ order, currency }: { order: AdminOrderEventOrder; currency: string }) {
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const total = getPayableTotal(order);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{order.billNumber}</span>
        <span className="truncate">{order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-medium">{formatCurrency(total, currency)}</span>
        <PaymentBadge status={paymentStatus} />
        <Link href={`/admin/orders/${order.id}`} className="text-xs text-primary hover:underline">
          View
        </Link>
      </div>
    </div>
  );
}

export function CashCounter({
  initialOrders,
  completedToday: completedTodayInitial,
  currency,
  shopName,
  shop,
}: {
  initialOrders: AdminOrderEventOrder[];
  completedToday: AdminOrderEventOrder[];
  currency: string;
  shopName: string;
  shop: BillShopData;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [completedToday, setCompletedToday] = useState(completedTodayInitial);
  const [query, setQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<AdminOrderEventOrder | null>(null);

  function refetchOrder(id: string) {
    api
      .get<AdminOrderEventOrder>(`/api/admin/orders/${id}`)
      .then((full) => {
        if (!ACTIONABLE_STATUSES.has(full.status)) {
          setOrders((prev) => prev.filter((o) => o.id !== full.id));
          if (full.status === "COMPLETED") {
            setCompletedToday((prev) => (prev.some((o) => o.id === full.id) ? prev.map((o) => (o.id === full.id ? full : o)) : [full, ...prev]));
          }
          return;
        }
        setOrders((prev) => (prev.some((o) => o.id === full.id) ? prev.map((o) => (o.id === full.id ? full : o)) : [...prev, full]));
      })
      .catch(() => {});
  }

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: (order) => refetchOrder(order.id),
    onUpdated: (order) => refetchOrder(order.id),
  });

  const filtered = useMemo(() => orders.filter((o) => matchesQuery(o, query)), [orders, query]);
  // Table orders are settled as a whole tab via the Tables board's "Mark as
  // Paid" (which also bulk-completes their tickets) — showing them here too
  // would let staff double-book the same payment through two different flows.
  const actionable = useMemo(() => filtered.filter((o) => !o.tableSessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [filtered]);
  const readyTableOrders = useMemo(
    () => filtered.filter((o) => o.status === "READY" && o.tableSessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [filtered]
  );
  const filteredCompleted = useMemo(() => completedToday.filter((o) => matchesQuery(o, query)), [completedToday, query]);

  async function completeOrder(order: AdminOrderEventOrder) {
    setUpdatingId(order.id);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { action: "status", status: "COMPLETED" });
      toast.success(`Order #${order.billNumber} marked complete`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handlePrint(order: AdminOrderEventOrder) {
    setPrintingId(order.id);
    try {
      const outcome = await printBill(toBillOrderData(order), shop);
      if (!outcome.ok) {
        toast.error(outcome.error ?? "Print failed");
      } else if (outcome.printer && outcome.printer.connectionType !== "SYSTEM") {
        toast.success(`Sent to ${outcome.printer.name}`);
      }
    } catch {
      toast.error("Print failed");
    } finally {
      setPrintingId(null);
    }
  }

  function handlePaid(updated: AdminOrderEventOrder) {
    refetchOrder(updated.id);
  }

  return (
    <div className="min-h-screen bg-muted/10">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/orders"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" /> Exit
          </Link>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-2">
            <Banknote className="size-5 text-primary" />
            <span className="font-bold text-lg">Cash Counter</span>
          </div>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search bill, name, table…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </header>

      <main className="p-4 sm:p-6 space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Active orders — {actionable.length}
          </h2>
          {actionable.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing active" description="New and in-progress orders show up here." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {actionable.map((order) => (
                <OrderCounterCard
                  key={order.id}
                  order={order}
                  currency={currency}
                  shop={shop}
                  updating={updatingId === order.id}
                  printing={printingId === order.id}
                  onRecordPayment={setPaymentOrder}
                  onComplete={completeOrder}
                  onPrint={handlePrint}
                />
              ))}
            </div>
          )}
        </section>

        {readyTableOrders.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Table orders ready — {readyTableOrders.length}
            </h2>
            <div className="rounded-xl border bg-card divide-y overflow-hidden">
              {readyTableOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{order.billNumber}</span>
                    <span className="truncate">Table {order.tableNumber}</span>
                  </div>
                  <Link href="/admin/tables" className="shrink-0 text-xs text-primary hover:underline">
                    Managed via Tables board
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Completed today — {filteredCompleted.length}
          </h2>
          {filteredCompleted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing completed yet today.</p>
          ) : (
            <div className="rounded-xl border bg-card divide-y overflow-hidden">
              {filteredCompleted.map((order) => (
                <CompletedRow key={order.id} order={order} currency={currency} />
              ))}
            </div>
          )}
        </section>
      </main>

      {paymentOrder && (
        <OrderPaymentModal
          order={paymentOrder}
          currency={currency}
          shop={shop}
          open={!!paymentOrder}
          onOpenChange={(open) => !open && setPaymentOrder(null)}
          onPaid={(updated) => {
            handlePaid(updated);
            setPaymentOrder(null);
          }}
        />
      )}

      <p className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-6">{shopName}</p>
    </div>
  );
}
