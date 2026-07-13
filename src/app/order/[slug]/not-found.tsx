import { Store } from "lucide-react";

export default function ShopNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <Store className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-bold">This shop isn&apos;t available</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may be incorrect, or this shop has temporarily paused orders. Please check with the
        business directly.
      </p>
    </div>
  );
}
