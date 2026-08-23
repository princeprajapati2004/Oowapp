"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, ClipboardList, LoaderCircle, LogIn, Wallet, Gift } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { getStoredOrders } from "@/lib/order-history-storage";
import type { OrderEventOrder } from "@/lib/hooks/use-order-events";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Confirmed",
  READY: "Confirmed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  READY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  OUT_FOR_DELIVERY: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  DELIVERED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// The four buckets asked for — Confirmed also covers every in-progress state
// (Preparing/Ready/Out for delivery) so an order is never hidden, just
// grouped with "confirmed" until it's actually delivered/completed.
const FILTERS = ["ALL", "PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(status: string, filter: Filter) {
  if (filter === "ALL") return true;
  if (filter === "CONFIRMED") {
    return status === "CONFIRMED" || status === "PREPARING" || status === "READY" || status === "OUT_FOR_DELIVERY";
  }
  if (filter === "COMPLETED") return status === "COMPLETED" || status === "DELIVERED";
  return status === filter;
}

export function OrderHistory({
  slug,
  businessName,
  currency,
  isLoggedIn,
}: {
  slug: string;
  businessName: string;
  currency: string;
  isLoggedIn: boolean;
}) {
  const [orders, setOrders] = useState<OrderEventOrder[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    // Logged in: server-side history tied to the account, authoritative
    // across devices. Guest: whatever this browser has placed, from
    // localStorage — see order-history-storage.ts.
    if (isLoggedIn) {
      fetch("/api/customer/orders")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { orders?: OrderEventOrder[] } | null) => setOrders(data?.orders ?? []))
        .catch(() => setOrders([]));
      return;
    }

    const refs = getStoredOrders(slug);
    // Promise.all([]) still resolves asynchronously via .then(), so this
    // stays a single code path instead of an early synchronous setState.
    Promise.all(
      refs.map((ref) =>
        fetch(`/api/orders/${ref.orderId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { order?: OrderEventOrder } | null) => data?.order ?? null)
          .catch(() => null)
      )
    ).then((results) => {
      const valid = results.filter((o): o is OrderEventOrder => o !== null);
      valid.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setOrders(valid);
    });
  }, [slug, isLoggedIn]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = query.trim().toLowerCase();
    return orders.filter((o) => matchesFilter(o.status, filter) && (!q || o.billNumber.toLowerCase().includes(q)));
  }, [orders, query, filter]);

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your orders</h1>
          <p className="text-sm text-muted-foreground">{businessName}</p>
        </div>

        {!isLoggedIn ? (
          <Link
            href={`/order/${slug}/login`}
            className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <LogIn className="size-4 shrink-0 text-primary" />
            Log in to see your orders from any device
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`/order/${slug}/wallet`}
              className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Wallet className="size-4 shrink-0 text-primary" />
              Wallet
            </Link>
            <Link
              href={`/order/${slug}/refer`}
              className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Gift className="size-4 shrink-0 text-primary" />
              Refer & earn
            </Link>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search bill number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {f === "ALL" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        {orders === null ? (
          <div className="flex justify-center py-12">
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No orders yet"
            description={
              isLoggedIn
                ? "Orders placed with your account will show up here."
                : "Orders you place from this device will show up here."
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => {
              const total = order.discountedTotal ?? order.grandTotal;
              return (
                <Link
                  key={order.id}
                  href={`/order/${slug}/track/${order.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium truncate">{order.billNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium mb-1",
                        STATUS_COLORS[order.status] ?? "bg-muted"
                      )}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <p className="font-semibold text-sm">{formatCurrency(total, currency)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
