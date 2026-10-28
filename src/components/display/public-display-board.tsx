"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BellRing,
  Clock,
  Crown,
  Flame,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api-client";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { useChime } from "@/lib/utils/chime";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_BADGE_CLASS, type OrderStatus } from "@/lib/order-status";
import { DISPLAY_TYPE_LABELS, type DisplayTypeValue, type DisplaySettings, type PublicDisplayOrder } from "@/lib/display-types";

const KITCHEN_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
};
const KITCHEN_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: "Accept",
  CONFIRMED: "Start preparing",
  PREPARING: "Mark ready",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isLate(order: PublicDisplayOrder, now: number, shopWideDelayedMinutes: number): boolean {
  if (["COMPLETED", "DELIVERED", "CANCELLED"].includes(order.status)) return false;
  if (order.prepDelayFlag) return true;
  if (order.estimatedReadyAt) return now > new Date(order.estimatedReadyAt).getTime();
  const minutesOpen = (now - new Date(order.createdAt).getTime()) / 60_000;
  return minutesOpen >= shopWideDelayedMinutes;
}

export function PublicDisplayBoard({
  token,
  displayId,
  displayName,
  type,
  allowStaffActions,
  settings,
  shopName,
  shopLogoUrl,
  initialOrders,
}: {
  token: string;
  displayId: string;
  displayName: string;
  type: DisplayTypeValue;
  allowStaffActions: boolean;
  settings: DisplaySettings;
  shopName: string;
  shopLogoUrl: string | null;
  initialOrders: PublicDisplayOrder[];
}) {
  void displayId;
  const [orders, setOrders] = useState(initialOrders);
  const [now, setNow] = useState(() => Date.now());
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { play } = useChime();
  const statusRef = useRef<Map<string, string>>(new Map(initialOrders.map((o) => [o.id, o.status])));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live orders can age into the "terminal, past auto-remove window" bucket
  // without a new SSE event ever firing — periodically re-apply the same
  // cutoff the server's initial snapshot query used (see buildDisplayOrderWhere).
  useEffect(() => {
    if (settings.autoRemoveCompletedMinutes <= 0) return;
    const id = setInterval(() => {
      setOrders((prev) =>
        prev.filter((o) => {
          if (!["COMPLETED", "DELIVERED", "CANCELLED"].includes(o.status)) return true;
          const ref = o.actualReadyAt ?? o.createdAt;
          return Date.now() - new Date(ref).getTime() < settings.autoRemoveCompletedMinutes * 60_000;
        })
      );
    }, 30_000);
    return () => clearInterval(id);
  }, [settings.autoRemoveCompletedMinutes]);

  useOrderEvents(`/api/display/${token}/stream`, {
    onCreated: (raw) => {
      const order = raw as unknown as PublicDisplayOrder;
      statusRef.current.set(order.id, order.status);
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [...prev, order]));
      setLastUpdatedAt(Date.now());
      if (soundEnabled && soundUnlocked) {
        play();
        toast.custom(() => (
          <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-background px-4 py-3 shadow-lg">
            <BellRing className="size-5 shrink-0 text-primary" />
            <p className="font-bold">New order #{order.billNumber}</p>
          </div>
        ));
      }
    },
    onUpdated: (raw) => {
      const order = raw as unknown as PublicDisplayOrder;
      const prevStatus = statusRef.current.get(order.id);
      statusRef.current.set(order.id, order.status);
      setLastUpdatedAt(Date.now());
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [...prev, order];
      });
      if (soundEnabled && soundUnlocked && prevStatus && prevStatus !== order.status && (order.status === "READY" || order.prepDelayFlag)) {
        play();
      }
    },
  });

  async function advanceKitchenOrder(order: PublicDisplayOrder) {
    const next = KITCHEN_NEXT[order.status as OrderStatus];
    if (!next) return;
    setUpdatingId(order.id);
    try {
      await api.patch(`/api/display/${token}/orders/${order.id}`, { action: "status", status: next });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
  }

  async function flagDelayed(order: PublicDisplayOrder) {
    setUpdatingId(order.id);
    try {
      await api.patch(`/api/display/${token}/orders/${order.id}`, { action: "flag_delayed" });
      toast.success("Order flagged as delayed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to flag order");
    } finally {
      setUpdatingId(null);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  function unlockSound() {
    setSoundUnlocked(true);
    play();
  }

  const visibleOrders = useMemo(() => {
    const sorted = [...orders].sort((a, b) => {
      const aLate = isLate(a, now, settings.delayedAlertMinutes ?? 15) ? 0 : 1;
      const bLate = isLate(b, now, settings.delayedAlertMinutes ?? 15) ? 0 : 1;
      if (aLate !== bLate) return aLate - bLate;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    return sorted.slice(0, settings.activeOrderLimit);
  }, [orders, now, settings.delayedAlertMinutes, settings.activeOrderLimit]);

  const fontClass = settings.fontSize === "sm" ? "text-sm" : settings.fontSize === "lg" ? "text-lg" : "text-base";

  return (
    <div className={cn("min-h-screen", settings.theme === "dark" && "dark", settings.theme === "light" && "light")}>
      <div className={cn("min-h-screen bg-background text-foreground", fontClass)}>
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 shadow-sm sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            {shopLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shopLogoUrl} alt={shopName} className="size-8 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{shopName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {displayName} · {DISPLAY_TYPE_LABELS[type]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Wifi className="size-3.5 text-emerald-500" /> Live
            </span>
            <span>·</span>
            <span>Updated {formatElapsed(now - lastUpdatedAt) === "0m" ? "just now" : `${formatElapsed(now - lastUpdatedAt)} ago`}</span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setSoundEnabled((v) => !v)} aria-label="Toggle sound">
              {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
            <Button type="button" variant="outline" size="icon-sm" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
              {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          </div>
        </header>

        {!soundUnlocked && settings.soundEnabled && (
          <button
            onClick={unlockSound}
            className="flex w-full items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Volume2 className="size-4" /> Tap to enable sound alerts on this screen
          </button>
        )}

        <main className="p-4 sm:p-6">
          {visibleOrders.length === 0 ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground">
              <WifiOff className="size-10 opacity-30" />
              <p className="text-lg font-medium">No active orders</p>
            </div>
          ) : type === "TOKEN" ? (
            <TokenGrid orders={visibleOrders} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visibleOrders.map((order) => (
                <OrderBoardCard
                  key={order.id}
                  order={order}
                  now={now}
                  settings={settings}
                  canAct={type === "KITCHEN" && allowStaffActions}
                  updating={updatingId === order.id}
                  onAdvance={advanceKitchenOrder}
                  onFlagDelayed={flagDelayed}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function OrderBoardCard({
  order,
  now,
  settings,
  canAct,
  updating,
  onAdvance,
  onFlagDelayed,
}: {
  order: PublicDisplayOrder;
  now: number;
  settings: DisplaySettings;
  canAct: boolean;
  updating: boolean;
  onAdvance: (order: PublicDisplayOrder) => void;
  onFlagDelayed: (order: PublicDisplayOrder) => void;
}) {
  const status = order.status as OrderStatus;
  const late = isLate(order, now, settings.delayedAlertMinutes ?? 15);
  const nextAction = canAct ? KITCHEN_ACTION_LABEL[status] : undefined;

  return (
    <div
      className={cn(
        "space-y-2.5 rounded-2xl border bg-card p-4 shadow-sm",
        late ? "border-destructive/50 ring-1 ring-destructive/20" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-muted-foreground">
            #{order.tokenNumber ?? order.billNumber}
          </p>
          {order.customerName && <p className="truncate text-lg font-bold">{order.customerName}</p>}
          {order.tableNumber && <p className="text-sm text-muted-foreground">Table {order.tableNumber}</p>}
        </div>
        <Badge className={cn("shrink-0 border", STATUS_BADGE_CLASS[status])} variant="outline">
          {STATUS_LABELS[status]}
        </Badge>
      </div>

      {(order.priorityFlag || late) && (
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
          {late && <Badge variant="destructive">Delayed</Badge>}
        </div>
      )}

      {order.items ? (
        <div className="space-y-1 border-t pt-2.5">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{item.name}</span>
              <span className="shrink-0 font-bold">×{item.quantity}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-t pt-2.5 text-muted-foreground">{order.itemCount} items</p>
      )}

      {order.notes && <p className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-900/25 dark:text-amber-300">{order.notes}</p>}

      {settings.showAmounts && order.grandTotal != null && <p className="font-semibold">₹{order.grandTotal.toFixed(2)}</p>}

      <div className="flex items-center justify-between border-t pt-2.5 text-sm text-muted-foreground">
        <span>{formatTime(order.createdAt)}</span>
        {settings.showPrepTime && order.estimatedReadyAt && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> Ready by {formatTime(order.estimatedReadyAt)}
          </span>
        )}
      </div>

      {canAct && (
        <div className="flex gap-2 pt-1">
          {nextAction ? (
            <Button size="lg" className="h-10 flex-1" disabled={updating} onClick={() => onAdvance(order)}>
              {updating ? "Updating…" : nextAction}
            </Button>
          ) : (
            <div className="flex h-10 flex-1 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">Ready</div>
          )}
          {status !== "READY" && (
            <Button size="lg" variant="outline" className="h-10" disabled={updating} onClick={() => onFlagDelayed(order)}>
              Delay
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TokenGrid({ orders }: { orders: PublicDisplayOrder[] }) {
  const STATUS_COLOR: Partial<Record<OrderStatus, string>> = {
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    PREPARING: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    READY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  };
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {orders.map((order) => {
        const status = order.status as OrderStatus;
        return (
          <div
            key={order.id}
            className={cn("flex flex-col items-center justify-center gap-1 rounded-2xl p-5 shadow-sm", STATUS_COLOR[status] ?? "bg-muted")}
          >
            <span className="text-4xl font-black tabular-nums">{order.tokenNumber ?? order.billNumber}</span>
            <span className="text-xs font-semibold uppercase tracking-wide">{STATUS_LABELS[status]}</span>
          </div>
        );
      })}
    </div>
  );
}
