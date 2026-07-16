import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="space-y-2">
        <p className="text-7xl font-bold text-muted-foreground/30 tabular-nums leading-none">404</p>
        <h1 className="text-xl font-bold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          This page doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Button render={<Link href="/login" />} nativeButton={false} variant="outline">
        Go to login
      </Button>
    </div>
  );
}
