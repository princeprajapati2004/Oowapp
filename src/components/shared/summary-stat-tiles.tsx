// Compact dashboard-summary strip — used at the top of the Returns &
// Refunds and Loss & Damage list pages. Mirrors the tile shape already used
// by src/components/admin/dashboard/live-table-stats.tsx so both features
// read as one system.
export function SummaryStatTiles({
  tiles,
}: {
  tiles: { label: string; value: string; accent?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border bg-card px-3 py-2.5 text-center">
          <p className={`text-lg font-bold tabular-nums ${tile.accent ?? ""}`}>{tile.value}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}
