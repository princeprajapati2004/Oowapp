import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-44 rounded-lg" />
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-52 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}
