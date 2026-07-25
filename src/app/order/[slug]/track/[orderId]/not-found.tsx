import { ReceiptText } from "lucide-react";

export default function TrackOrderNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center bg-muted/20">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <ReceiptText className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight">Order not found</h1>
        <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
          This tracking link may be incorrect or the order no longer exists. Check with the business directly.
        </p>
      </div>
    </div>
  );
}
