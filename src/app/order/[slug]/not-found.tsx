import { Store } from "lucide-react";

export default function ShopNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center bg-muted/20">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <Store className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight">Shop not available</h1>
        <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
          The link may be incorrect, or this shop has paused orders. Check with the business directly.
        </p>
      </div>
    </div>
  );
}
