"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChefHat, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useOrderEvents, type OrderEventOrder } from "@/lib/hooks/use-order-events";

type KitchenStatus = "PENDING" | "CONFIRMED" | "PREPARING";

// Orders leave the kitchen's view entirely once they're Ready — at that
// point they belong on the cash counter, not here.
const KITCHEN_STATUSES: KitchenStatus[] = ["PENDING", "CONFIRMED", "PREPARING"];
const NEXT_STATUS: Record<KitchenStatus, string> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
};
const ACTION_LABEL: Record<KitchenStatus, string> = {
  PENDING: "Confirm order",
  CONFIRMED: "Start preparing",
  PREPARING: "Mark ready",
};
const STATUS_LABELS: Record<KitchenStatus, string> = {
  PENDING: "New",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
};
const STATUS_BADGE: Record<KitchenStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

function isKitchenStatus(status: string): status is KitchenStatus {
  return (KITCHEN_STATUSES as string[]).includes(status);
}

function ageMinutes(createdAt: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
}

function ageCardClass(minutes: number) {
  if (minutes >= 15) return "border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10";
  if (minutes >= 5) return "border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10";
  return "border-border bg-card";
}

function ageLabel(minutes: number) {
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}

export function KitchenDisplay({
  initialOrders,
  shopName,
}: {
  initialOrders: OrderEventOrder[];
  shopName: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: (order) => {
      if (!isKitchenStatus(order.status)) return;
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [...prev, order]));
      toast.message(`New order — #${order.billNumber}`);
    },
    onUpdated: (order) => {
      setOrders((prev) => {
        if (!isKitchenStatus(order.status)) return prev.filter((o) => o.id !== order.id);
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [...prev, order];
      });
    },
  });

  const sorted = useMemo(
    () => [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders]
  );

  async function advance(order: OrderEventOrder) {
    const next = NEXT_STATUS[order.status as KitchenStatus];
    if (!next) return;
    const prevOrders = orders;
    setUpdatingId(order.id);
    setOrders((prev) =>
      isKitchenStatus(next)
        ? prev.map((o) => (o.id === order.id ? { ...o, status: next } : o))
        : prev.filter((o) => o.id !== order.id)
    );
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { action: "status", status: next });
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
            <ChefHat className="size-5 text-primary" />
            <span className="font-bold text-lg">Kitchen Display</span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {shopName} — {sorted.length} active order{sorted.length !== 1 ? "s" : ""}
        </div>
      </header>

      <main className="p-4 sm:p-6">
        {sorted.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <EmptyState
              icon={ClipboardCheck}
              title="All caught up"
              description="New orders will appear here instantly."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((order) => {
              const status = order.status as KitchenStatus;
              const minutes = ageMinutes(order.createdAt, now);
              return (
                <div
                  key={order.id}
                  className={cn("rounded-2xl border-2 p-4 space-y-3 transition-colors", ageCardClass(minutes))}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground truncate">{order.billNumber}</p>
                      <p className="text-xl font-bold truncate">
                        {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_BADGE[status])}>
                        {STATUS_LABELS[status]}
                      </span>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{ageLabel(minutes)}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 border-t pt-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-baseline justify-between gap-2">
                        <span className="text-base font-semibold">{item.name}</span>
                        <span className="text-lg font-bold tabular-nums shrink-0">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {order.notes && (
                    <div className="rounded-lg bg-amber-100 dark:bg-amber-900/25 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-300">
                      {order.notes}
                    </div>
                  )}

                  <Button
                    size="lg"
                    className="h-11 w-full"
                    disabled={updatingId === order.id}
                    onClick={() => advance(order)}
                  >
                    {updatingId === order.id ? "Updating…" : ACTION_LABEL[status]}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
