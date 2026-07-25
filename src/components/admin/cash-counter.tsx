"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Banknote, Search, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { useOrderEvents, type OrderEventOrder } from "@/lib/hooks/use-order-events";

// Everything up to Ready is still "in progress" and shown only for
// reference — the counter's own job starts once an order is Ready.
const COUNTER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY"];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "New",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
};
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

function matchesQuery(order: OrderEventOrder, query: string) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    order.billNumber.toLowerCase().includes(q) ||
    (order.customerName ?? "").toLowerCase().includes(q) ||
    (order.tableNumber ?? "").toLowerCase().includes(q)
  );
}

export function CashCounter({
  initialOrders,
  currency,
  shopName,
}: {
  initialOrders: OrderEventOrder[];
  currency: string;
  shopName: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: (order) => {
      if (!COUNTER_STATUSES.includes(order.status)) return;
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [...prev, order]));
    },
    onUpdated: (order) => {
      setOrders((prev) => {
        if (!COUNTER_STATUSES.includes(order.status)) return prev.filter((o) => o.id !== order.id);
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [...prev, order];
      });
    },
  });

  const filtered = useMemo(() => orders.filter((o) => matchesQuery(o, query)), [orders, query]);
  const ready = useMemo(
    () => filtered.filter((o) => o.status === "READY").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [filtered]
  );
  const inProgress = useMemo(
    () => filtered.filter((o) => o.status !== "READY").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [filtered]
  );

  async function completeOrder(order: OrderEventOrder) {
    const prevOrders = orders;
    setUpdatingId(order.id);
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { action: "status", status: "COMPLETED" });
      toast.success(`Order #${order.billNumber} completed`);
    } catch (err) {
      setOrders(prevOrders);
      toast.error(err instanceof ApiError ? err.message : "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
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
            Ready for payment — {ready.length}
          </h2>
          {ready.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing waiting" description="Orders show up here once the kitchen marks them ready." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ready.map((order) => {
                const total = order.discountedTotal ?? order.grandTotal;
                return (
                  <div key={order.id} className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/10 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground truncate">{order.billNumber}</p>
                        <p className="text-lg font-bold truncate">
                          {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Ready
                      </span>
                    </div>

                    <div className="space-y-1 border-t pt-2 text-sm text-muted-foreground">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between gap-2">
                          <span className="truncate">{item.name} × {item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-baseline justify-between border-t pt-2">
                      <span className="text-sm font-medium text-muted-foreground">Total due</span>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {formatCurrency(total, currency)}
                      </span>
                    </div>

                    <Button
                      size="lg"
                      className="h-11 w-full gap-1.5"
                      disabled={updatingId === order.id}
                      onClick={() => completeOrder(order)}
                    >
                      <CircleCheck className="size-4" />
                      {updatingId === order.id ? "Completing…" : "Mark paid & complete"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Still preparing — {inProgress.length}
          </h2>
          {inProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing else in progress.</p>
          ) : (
            <div className="rounded-xl border bg-card divide-y overflow-hidden">
              {inProgress.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{order.billNumber}</span>
                    <span className="truncate">
                      {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_BADGE[order.status]
                    )}
                  >
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <p className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-6">{shopName}</p>
    </div>
  );
}
