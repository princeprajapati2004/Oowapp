"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils/relative-time";
import { cn } from "@/lib/utils";
import { useOrderEvents, type NotificationEventPayload } from "@/lib/hooks/use-order-events";

type Filter = "all" | "unread";

export function NotificationCenter({ initialNotifications }: { initialNotifications: NotificationEventPayload[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [filter, setFilter] = useState<Filter>("all");
  const [nowMs, setNowMs] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => setNowMs(Date.now()), []);

  useOrderEvents("/api/admin/orders/stream", {
    onNotification: (n) => setNotifications((prev) => [n, ...prev]),
  });

  const filtered = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications),
    [notifications, filter]
  );
  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  function handleSelect(n: NotificationEventPayload) {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      api.patch(`/api/admin/notifications/${n.id}`).catch(() => {});
    }
  }

  async function handleDelete(id: string) {
    const previous = notifications;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.delete(`/api/admin/notifications/${id}`);
    } catch (error) {
      setNotifications(previous);
      toast.error(error instanceof ApiError ? error.message : "Failed to delete notification");
    }
  }

  async function handleClearAll() {
    setClearing(true);
    const previous = notifications;
    try {
      await api.delete("/api/admin/notifications");
      setNotifications([]);
      toast.success("Notifications cleared");
    } catch (error) {
      setNotifications(previous);
      toast.error(error instanceof ApiError ? error.message : "Failed to clear notifications");
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
          </p>
        </div>
        {notifications.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowClearConfirm(true)}>
            <Trash2 className="size-3.5" /> Clear all
          </Button>
        )}
      </div>

      <div className="flex overflow-hidden rounded-md border text-sm w-fit">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 font-medium transition-colors capitalize",
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
          description="Activity like new orders, bill requests, and payments will show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {filtered.map((n) => {
            const itemClassName = "flex-1 min-w-0 text-left space-y-0.5 block";
            const content = (
              <>
                <div className="flex items-center gap-1.5">
                  {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="font-medium text-sm">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {nowMs ? formatRelativeTime(n.createdAt, nowMs) : ""}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{n.body}</p>
              </>
            );
            return (
              <div key={n.id} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors", !n.isRead && "bg-primary/5")}>
                {n.link ? (
                  <Link href={n.link} onClick={() => handleSelect(n)} className={itemClassName}>
                    {content}
                  </Link>
                ) : (
                  <button type="button" onClick={() => handleSelect(n)} className={itemClassName}>
                    {content}
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(n.id)}
                  aria-label="Delete notification"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear all notifications?"
        description="This permanently removes your entire notification history. This can't be undone."
        confirmLabel={clearing ? "Clearing…" : "Clear all"}
        destructive
        onConfirm={handleClearAll}
      />
    </div>
  );
}
