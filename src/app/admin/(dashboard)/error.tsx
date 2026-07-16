"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-muted/20 py-16 text-center px-6">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="size-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-sm">Something went wrong</p>
        <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">Try again</Button>
    </div>
  );
}
