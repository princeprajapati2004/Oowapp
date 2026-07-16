import { Skeleton } from "@/components/ui/skeleton";

export default function OrderPageLoading() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="sticky top-0 z-30 border-b bg-background/98">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3 flex gap-2">
          {[80, 96, 72, 88].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full shrink-0" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden border bg-card">
              <Skeleton className="aspect-[4/3] w-full" />
              <div className="p-3 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4 rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
                <Skeleton className="h-4 w-1/3 rounded-md mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
