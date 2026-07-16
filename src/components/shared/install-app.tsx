"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallAppProps {
  className?: string;
  /** When true the button is always rendered, even before the browser fires
   *  beforeinstallprompt. Use this on public pages (login/signup) so users
   *  always see the install option. Falls back to a browser-menu hint when
   *  the native prompt is not yet available. */
  alwaysShow?: boolean;
}

export function InstallApp({ className, alwaysShow = false }: InstallAppProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Always hide until client hydration is done (avoids SSR mismatch)
  if (!mounted) return null;

  // Already installed in standalone mode → never show
  if (isInstalled) return null;

  // Default (compact) mode: only show when browser has a prompt ready
  if (!alwaysShow && !deferredPrompt) return null;

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsInstalled(true);
      }
      return;
    }
    // Browser hasn't offered the prompt yet (HTTP dev, Firefox, iOS, etc.)
    // Give the user a universal hint instead
    toast.info(
      'To install: open your browser menu and tap "Add to Home Screen".',
      { duration: 5000 }
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleInstall}
      className={cn("gap-2", className)}
    >
      <Download className="size-4" />
      Install App
    </Button>
  );
}
