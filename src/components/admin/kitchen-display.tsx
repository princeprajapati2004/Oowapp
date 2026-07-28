"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  BellRing,
  ChefHat,
  ClipboardCheck,
  Crown,
  Flame,
  MoreVertical,
  Printer,
  Search,
  ShoppingBag,
  Truck,
  Utensils,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useOrderEvents, type OrderEventOrder } from "@/lib/hooks/use-order-events";

type KitchenStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "READY";
type StatusFilter = "ALL" | KitchenStatus | "COMPLETED";
type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
type PriorityFlag = "VIP" | "RUSH";

// Orders leave the kitchen's actionable pipeline once they're Ready — at that
// point they belong to Cash Counter / the Tables board, not here. Kitchen only
// ever advances a ticket up to READY; it never marks anything COMPLETED.
const KITCHEN_STATUSES: KitchenStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY"];
const NEXT_STATUS: Partial<Record<KitchenStatus, string>> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
};
const ACTION_LABEL: Partial<Record<KitchenStatus, string>> = {
  PENDING: "Accept",
  CONFIRMED: "Start preparing",
  PREPARING: "Mark ready",
};
const STATUS_LABELS: Record<KitchenStatus, string> = {
  PENDING: "New",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
};
const STATUS_BADGE: Record<KitchenStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  READY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

// Elapsed-time urgency bands, independent of status color — a "New" order
// sitting for 20 minutes is still red-bordered even though its badge is amber.
const AGE_BAND_CLASS: Record<"green" | "yellow" | "orange" | "red", string> = {
  green: "border-border bg-card",
  yellow: "border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10",
  orange: "border-orange-400 dark:border-orange-700 bg-orange-50/70 dark:bg-orange-900/15",
  red: "border-red-400 dark:border-red-700 bg-red-50/70 dark:bg-red-900/15",
};

const DELAYED_MINUTES = 15;
const LARGE_ORDER_QTY = 8;
const SOUND_PREF_KEY = "kds-sound-enabled";

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: "Dine-In",
  TAKEAWAY: "Takeaway",
  DELIVERY: "Delivery",
};
const ORDER_TYPE_ICON: Record<OrderType, LucideIcon> = {
  DINE_IN: Utensils,
  TAKEAWAY: ShoppingBag,
  DELIVERY: Truck,
};

function isKitchenStatus(status: string): status is KitchenStatus {
  return (KITCHEN_STATUSES as string[]).includes(status);
}

function orderType(order: OrderEventOrder): OrderType {
  if (order.tableNumber) return "DINE_IN";
  if (order.deliveryAddress) return "DELIVERY";
  return "TAKEAWAY";
}

function isLargeOrder(order: OrderEventOrder) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0) >= LARGE_ORDER_QTY;
}

function ageBand(minutes: number): "green" | "yellow" | "orange" | "red" {
  if (minutes < 5) return "green";
  if (minutes < 10) return "yellow";
  if (minutes < 20) return "orange";
  return "red";
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function matchesQuery(order: OrderEventOrder, query: string) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    order.billNumber.toLowerCase().includes(q) ||
    (order.customerName ?? "").toLowerCase().includes(q) ||
    (order.tableNumber ?? "").toLowerCase().includes(q)
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function printTicket(order: OrderEventOrder) {
  const win = window.open("", "_blank", "width=380,height=600");
  if (!win) return;
  const title = order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in";
  const itemsHtml = order.items
    .map((item) => `<div class="item"><span>${escapeHtml(item.name)}</span><span>x${item.quantity}</span></div>`)
    .join("");
  win.document.write(`<!doctype html>
<html>
<head>
<title>Ticket ${escapeHtml(order.billNumber)}</title>
<style>
  body { font-family: ui-monospace, "Courier New", monospace; padding: 16px; font-size: 14px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #555; font-size: 12px; margin-bottom: 12px; }
  .item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ccc; font-size: 15px; }
  .note { margin-top: 14px; padding: 8px 10px; background: #fff3cd; border-radius: 6px; font-weight: 700; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="muted">#${escapeHtml(order.billNumber)} &middot; ${escapeHtml(new Date(order.createdAt).toLocaleString())}</div>
  ${itemsHtml}
  ${order.notes ? `<div class="note">${escapeHtml(order.notes)}</div>` : ""}
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}

function playChime(ctx: AudioContext) {
  const start = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = start + i * 0.15;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

const OrderCard = memo(function OrderCard({
  order,
  updating,
  onAdvance,
  onSetPriority,
}: {
  order: OrderEventOrder;
  updating: boolean;
  onAdvance: (order: OrderEventOrder) => void;
  onSetPriority: (order: OrderEventOrder, flag: PriorityFlag | null) => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = order.status as KitchenStatus;
  const isReady = status === "READY";
  const elapsedMs = now - new Date(order.createdAt).getTime();
  const minutes = elapsedMs / 60_000;
  const band = ageBand(minutes);
  const type = orderType(order);
  const TypeIcon = ORDER_TYPE_ICON[type];
  const large = isLargeOrder(order);
  const delayed = !isReady && minutes >= DELAYED_MINUTES;

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-2 duration-300 space-y-3 rounded-2xl border-2 p-4 transition-colors",
        isReady ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10" : AGE_BAND_CLASS[band]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate font-mono">{order.billNumber}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <TypeIcon className="size-3" />
              {ORDER_TYPE_LABEL[type]}
            </span>
          </div>
          <p className="truncate text-xl font-bold">
            {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"}
          </p>
          {order.customerName && order.tableNumber && (
            <p className="truncate text-sm text-muted-foreground">{order.customerName}</p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_BADGE[status])}>
            {STATUS_LABELS[status]}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSetPriority(order, "VIP")}>
                <Crown className="size-4 text-amber-500" /> Mark VIP
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetPriority(order, "RUSH")}>
                <Flame className="size-4 text-red-500" /> Mark Rush
              </DropdownMenuItem>
              {order.priorityFlag && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onSetPriority(order, null)}>Clear priority</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(order.priorityFlag || large || delayed) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {order.priorityFlag === "VIP" && (
            <Badge className="gap-1 bg-amber-500 text-white">
              <Crown className="size-3" /> VIP
            </Badge>
          )}
          {order.priorityFlag === "RUSH" && (
            <Badge className="gap-1 bg-red-500 text-white">
              <Flame className="size-3" /> Rush
            </Badge>
          )}
          {large && <Badge variant="outline">Large order</Badge>}
          {delayed && <Badge variant="destructive">Delayed</Badge>}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-2.5">
        <span className="text-sm font-medium text-muted-foreground">
          {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-1.5">
          {band === "red" && !isReady && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
          )}
          <span className="text-lg font-bold tabular-nums">{formatElapsed(elapsedMs)}</span>
        </div>
      </div>

      <div className="space-y-1.5 border-t pt-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold">{item.name}</span>
            <span className="shrink-0 text-lg font-bold tabular-nums">×{item.quantity}</span>
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="flex gap-2 rounded-lg border-l-4 border-amber-500 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-900/25 dark:text-amber-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{order.notes}</span>
        </div>
      )}

      <div className="flex gap-2">
        {isReady ? (
          <div className="flex h-11 flex-1 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
            Sent to counter
          </div>
        ) : (
          <Button size="lg" className="h-11 flex-1 text-base" disabled={updating} onClick={() => onAdvance(order)}>
            {updating ? "Updating…" : ACTION_LABEL[status]}
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          className="h-11 w-11 shrink-0 px-0"
          onClick={() => printTicket(order)}
          aria-label="Print kitchen ticket"
        >
          <Printer className="size-4" />
        </Button>
      </div>
    </div>
  );
});

export function KitchenDisplay({
  initialOrders,
  completedToday: completedTodayInitial,
  shopName,
}: {
  initialOrders: OrderEventOrder[];
  completedToday: OrderEventOrder[];
  shopName: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [completedToday, setCompletedToday] = useState(completedTodayInitial);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<Set<OrderType>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [prepSamples, setPrepSamples] = useState<number[]>([]);

  const statusRef = useRef<Map<string, string>>(new Map(initialOrders.map((o) => [o.id, o.status])));
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundEnabled(localStorage.getItem(SOUND_PREF_KEY) === "1");
  }, []);

  function ensureAudioContext() {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  // Browsers block audio until a user gesture — silently unlock playback on
  // the first tap/keypress so the sound toggle (enabled via localStorage from
  // a prior session) actually works once a real new-order event fires later.
  useEffect(() => {
    function unlock() {
      ensureAudioContext();
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
    if (next) ensureAudioContext();
  }

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: (order) => {
      if (!isKitchenStatus(order.status)) return;
      statusRef.current.set(order.id, order.status);
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [...prev, order]));

      if (soundEnabled) {
        const ctx = ensureAudioContext();
        if (ctx) playChime(ctx);
      }
      toast.custom(
        () => (
          <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-background px-4 py-3 shadow-lg">
            <BellRing className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-bold">New order received</p>
              <p className="text-sm text-muted-foreground">
                {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"} · #{order.billNumber}
              </p>
            </div>
          </div>
        ),
        { duration: 4000 }
      );
    },
    onUpdated: (order) => {
      const prevStatus = statusRef.current.get(order.id);
      statusRef.current.set(order.id, order.status);

      if (prevStatus && prevStatus !== "READY" && order.status === "READY") {
        const minutes = (Date.now() - new Date(order.createdAt).getTime()) / 60_000;
        setPrepSamples((s) => [...s, minutes].slice(-50));
      }

      setOrders((prev) => {
        if (!isKitchenStatus(order.status)) return prev.filter((o) => o.id !== order.id);
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [...prev, order];
      });

      if (order.status === "COMPLETED") {
        setCompletedToday((prev) => (prev.some((o) => o.id === order.id) ? prev : [order, ...prev]));
      }
    },
  });

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

  async function setPriority(order: OrderEventOrder, priorityFlag: PriorityFlag | null) {
    const prevOrders = orders;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, priorityFlag } : o)));
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { action: "priority", priorityFlag });
    } catch (err) {
      setOrders(prevOrders);
      toast.error(err instanceof ApiError ? err.message : "Failed to update priority");
    }
  }

  function toggleType(t: OrderType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const visibleOrders = useMemo(() => {
    if (statusFilter === "COMPLETED") {
      return completedToday.filter((o) => matchesQuery(o, query));
    }
    return orders
      .filter((o) => statusFilter === "ALL" || o.status === statusFilter)
      .filter((o) => typeFilter.size === 0 || typeFilter.has(orderType(o)))
      .filter((o) => matchesQuery(o, query))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [orders, completedToday, statusFilter, typeFilter, query]);

  const stats = useMemo(() => {
    const newCount = orders.filter((o) => o.status === "PENDING").length;
    const preparingCount = orders.filter((o) => o.status === "CONFIRMED" || o.status === "PREPARING").length;
    const readyCount = orders.filter((o) => o.status === "READY").length;
    const avgPrep = prepSamples.length ? Math.round(prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length) : null;
    return { newCount, preparingCount, readyCount, avgPrep };
  }, [orders, prepSamples]);

  return (
    <div className="min-h-screen bg-muted/10">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/orders"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Exit
          </Link>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-2">
            <ChefHat className="size-5 text-primary" />
            <span className="text-lg font-bold">Kitchen Display</span>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <div className="relative w-full max-w-56 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search order, table, name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={soundEnabled ? "Mute new order sound" : "Enable new order sound"}
            onClick={toggleSound}
          >
            {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">{shopName}</span>
        </div>
      </header>

      <main className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="New orders" value={stats.newCount} />
          <StatTile label="Preparing" value={stats.preparingCount} />
          <StatTile label="Ready" value={stats.readyCount} />
          <StatTile label="Completed today" value={completedToday.length} />
          <StatTile label="Avg prep time" value={stats.avgPrep != null ? `${stats.avgPrep}m` : "—"} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="PENDING">New</TabsTrigger>
              <TabsTrigger value="CONFIRMED">Accepted</TabsTrigger>
              <TabsTrigger value="PREPARING">Preparing</TabsTrigger>
              <TabsTrigger value="READY">Ready</TabsTrigger>
              <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-1.5">
            {(["DINE_IN", "TAKEAWAY", "DELIVERY"] as const).map((t) => {
              const Icon = ORDER_TYPE_ICON[t];
              const active = typeFilter.has(t);
              return (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="gap-1.5"
                  onClick={() => toggleType(t)}
                >
                  <Icon className="size-3.5" /> {ORDER_TYPE_LABEL[t]}
                </Button>
              );
            })}
          </div>
        </div>

        {visibleOrders.length === 0 ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <EmptyState
              icon={ClipboardCheck}
              title="All caught up"
              description="New orders will appear here instantly."
            />
          </div>
        ) : statusFilter === "COMPLETED" ? (
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {visibleOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{order.billNumber}</span>
                  <span className="truncate">
                    {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  Completed
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                updating={updatingId === order.id}
                onAdvance={advance}
                onSetPriority={setPriority}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
