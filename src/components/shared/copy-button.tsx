"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// navigator.clipboard requires a secure context (HTTPS or localhost) — falls
// back to the old execCommand("copy") trick (e.g. an admin previewing over
// plain HTTP on a LAN IP) so the button still works instead of silently
// failing every time.
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path below
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Shared "Copy to clipboard" button — success/failure toast + a temporary
 * "Copied!" state. Consolidates the ad hoc copy-to-clipboard implementations
 * previously duplicated across refer-page.tsx, order-tracker.tsx,
 * current-order-page.tsx, party-statement.tsx, use-bill-actions.ts, and
 * subscription-billing-section.tsx.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied!",
  variant = "outline",
  size = "default",
  className,
  iconOnly = false,
  successMessage = "Copied to clipboard",
  errorMessage = "Couldn't copy — please copy it manually",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
  iconOnly?: boolean;
  successMessage?: string;
  errorMessage?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  async function handleClick() {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      toast.success(successMessage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(errorMessage);
    }
  }

  const Icon = copied ? Check : Copy;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(iconOnly && "shrink-0 px-0", className)}
      onClick={handleClick}
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
    >
      <Icon className="size-4" />
      {!iconOnly && (copied ? copiedLabel : label)}
    </Button>
  );
}
