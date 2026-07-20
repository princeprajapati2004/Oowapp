"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

type PushState = "unsupported" | "denied" | "granted" | "default" | "loading";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission as PushState);

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscription(sub);
      });
    });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    setState("loading");
    try {
      // Get VAPID public key from server
      const { publicKey } = await api.get<{ publicKey: string | null }>("/api/admin/push/vapid-key");
      if (!publicKey) {
        setState(Notification.permission as PushState);
        return false;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission as PushState);
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      await api.post("/api/admin/push/subscribe", {
        endpoint: sub.endpoint,
        keys: {
          p256dh: btoa(
            String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))
          ),
          auth: btoa(
            String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))
          ),
        },
      });

      setSubscription(sub);
      setState("granted");
      return true;
    } catch {
      setState(Notification.permission as PushState);
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!subscription) return;
    try {
      await fetch("/api/admin/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setState("default");
    } catch {
      // ignore
    }
  }, [subscription]);

  return { state, subscription, subscribe, unsubscribe };
}
