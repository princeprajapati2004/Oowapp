"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderPageError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center bg-muted/20">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="size-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted-foreground">Please refresh the page and try again.</p>
      </div>
      <Button onClick={reset} variant="outline">Try again</Button>
    </div>
  );
}
