"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Poll for SW updates every minute
          const id = setInterval(() => reg.update(), 60_000);
          return () => clearInterval(id);
        })
        .catch(() => {
          // SW registration failure is non-fatal
        });
    }
  }, []);

  return null;
}
