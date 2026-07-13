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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Please refresh the page and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
