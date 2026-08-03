import Link from "next/link";

function StatTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export function LiveTableStats({
  available,
  occupied,
  awaitingPayment,
  pendingKitchenOrders,
}: {
  available: number;
  occupied: number;
  awaitingPayment: number;
  pendingKitchenOrders: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">Live tables &amp; kitchen</p>
        <Link href="/admin/tables" className="text-xs text-primary hover:underline">
          View tables →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Available" value={available} accent="text-emerald-600 dark:text-emerald-400" />
        <StatTile label="Occupied" value={occupied} accent="text-amber-600 dark:text-amber-400" />
        <StatTile label="Awaiting Payment" value={awaitingPayment} accent="text-violet-600 dark:text-violet-400" />
        <StatTile label="Pending Kitchen Orders" value={pendingKitchenOrders} accent="text-blue-600 dark:text-blue-400" />
      </div>
    </div>
  );
}
