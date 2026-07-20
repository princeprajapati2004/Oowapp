"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "@/components/shared/toggle-row";
import { api, ApiError } from "@/lib/api-client";
import { usePushNotifications } from "@/lib/hooks/use-push-notifications";
import { notificationSettingsSchema, type NotificationSettingsInput } from "@/lib/validation/shop-settings";

export function NotificationSettingsForm({
  defaultValues,
  bare,
}: {
  defaultValues: NotificationSettingsInput;
  bare?: boolean;
}) {
  const { state, subscription, subscribe } = usePushNotifications();
  const [prefs, setPrefs] = useState(defaultValues);
  const [saving, setSaving] = useState(false);
  const [enabling, setEnabling] = useState(false);

  function setPref(key: keyof NotificationSettingsInput, value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function savePrefs() {
    const parsed = notificationSettingsSchema.safeParse(prefs);
    if (!parsed.success) return;
    setSaving(true);
    try {
      await api.patch("/api/admin/business", {
        section: "notifications",
        ...parsed.data,
      });
      toast.success("Notification preferences saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnable() {
    setEnabling(true);
    const ok = await subscribe();
    setEnabling(false);
    if (ok) toast.success("Push notifications enabled!");
    else if (Notification.permission === "denied")
      toast.error("Notifications are blocked. Enable them in your browser settings.");
    else
      toast.error("Could not enable push notifications. Check VAPID configuration.");
  }

  const isGranted = state === "granted" && !!subscription;
  const isUnsupported = state === "unsupported";
  const isDenied = state === "denied";

  const content = (
    <div className="space-y-4">
      {/* Push permission status */}
      <div className="rounded-xl border bg-muted/30 px-4 py-3 flex items-start gap-3">
        {state === "loading" ? (
          <Loader2 className="size-5 text-muted-foreground mt-0.5 animate-spin shrink-0" />
        ) : isGranted ? (
          <BellRing className="size-5 text-emerald-500 mt-0.5 shrink-0" />
        ) : isDenied || isUnsupported ? (
          <BellOff className="size-5 text-muted-foreground mt-0.5 shrink-0" />
        ) : (
          <Bell className="size-5 text-muted-foreground mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {isUnsupported
              ? "Push notifications not supported"
              : isDenied
              ? "Notifications blocked"
              : isGranted
              ? "Push notifications active"
              : "Push notifications not enabled"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isUnsupported
              ? "Your browser does not support Web Push. Use Chrome or Edge on Android or desktop."
              : isDenied
              ? "You've blocked notifications. To enable, click the lock icon in your browser address bar and allow notifications."
              : isGranted
              ? "You'll receive notifications for new orders even when the app is closed."
              : "Enable to receive instant alerts for new orders on this device."}
          </p>
        </div>
        {!isGranted && !isUnsupported && !isDenied && state !== "loading" && (
          <Button
            size="sm"
            className="h-8 shrink-0"
            disabled={enabling}
            onClick={handleEnable}
          >
            {enabling ? <Loader2 className="size-3.5 animate-spin" /> : "Enable"}
          </Button>
        )}
      </div>

      {/* Notification preferences */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
          Notify me when…
        </p>
        <ToggleRow
          label="New order received"
          description="Get an instant notification whenever a customer places an order."
          checked={prefs.notifyNewOrders}
          onCheckedChange={(v) => setPref("notifyNewOrders", v)}
        />
        <ToggleRow
          label="Order status updated"
          description="Notify when an order status changes (Confirmed, Ready, Completed, etc.)."
          checked={prefs.notifyOrderUpdates}
          onCheckedChange={(v) => setPref("notifyOrderUpdates", v)}
        />
      </div>

      <Button onClick={savePrefs} disabled={saving}>
        {saving ? "Saving…" : "Save notification preferences"}
      </Button>
    </div>
  );

  if (bare) return content;

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
      <div className="px-4 py-4 border-b">
        <p className="font-heading text-base font-medium">Notification settings</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage push notifications for this device.
        </p>
      </div>
      <div className="px-4 py-4">{content}</div>
    </div>
  );
}
