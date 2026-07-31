"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, BellRing, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { useOrderEvents, type NotificationEventPayload } from "@/lib/hooks/use-order-events";
import { useChime } from "@/lib/utils/chime";
import { formatRelativeTime } from "@/lib/utils/relative-time";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SOUND_PREF_KEY = "admin-notif-sound-enabled";

export function NotificationBell({ initialNotifications }: { initialNotifications: NotificationEventPayload[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  // Date.now() can't be read during render — captured once on mount, same
  // pattern as party-statement.tsx's nowMs.
  const [nowMs, setNowMs] = useState(0);
  const { play } = useChime();

  useEffect(() => {
    setSoundEnabled(localStorage.getItem(SOUND_PREF_KEY) === "1");
    setNowMs(Date.now());
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  useOrderEvents("/api/admin/orders/stream", {
    onNotification: (n) => {
      setNotifications((prev) => [n, ...prev]);
      if (soundEnabled) play();
    },
  });

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
  }

  function handleSelect(n: NotificationEventPayload) {
    setOpen(false);
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      api.patch(`/api/admin/notifications/${n.id}`).catch(() => {});
    }
    if (n.link) router.push(n.link);
  }

  async function handleMarkAllRead() {
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await api.patch("/api/admin/notifications", { action: "read_all" });
    } catch (err) {
      setNotifications(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to mark all as read");
    }
  }

  const recent = notifications.slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" aria-label="Notifications" className="relative" />}
      >
        {unreadCount > 0 ? <BellRing className="size-4.5" /> : <Bell className="size-4.5" />}
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-0.5 -right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <PopoverHeader className="flex-row items-center justify-between px-3 pt-3 pb-2">
          <PopoverTitle>Notifications</PopoverTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Mute notification sound" : "Enable notification sound"}
            >
              {soundEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            </Button>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleMarkAllRead}>
                <CheckCheck className="size-3.5" /> Mark all read
              </Button>
            )}
          </div>
        </PopoverHeader>

        {recent.length === 0 ? (
          <p className="px-3 pb-4 text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="space-y-0.5 px-1 pb-1">
              {recent.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleSelect(n)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                    !n.isRead && "bg-primary/5"
                  )}
                >
                  <div className="flex w-full items-center gap-1.5">
                    {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className="flex-1 truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {nowMs ? formatRelativeTime(n.createdAt, nowMs) : ""}
                    </span>
                  </div>
                  <p className="w-full truncate text-xs text-muted-foreground">{n.body}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs"
            onClick={() => setOpen(false)}
            render={<Link href="/admin/notifications" />}
            nativeButton={false}
          >
            View all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
