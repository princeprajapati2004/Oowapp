import { Check, Circle } from "lucide-react";
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-status";

type TimelineEvent = { status: string; changedAt: string };

/**
 * Real status history only (brief: "do not create fake timestamps" / "only
 * show states that actually occurred"). Order Placed always comes from
 * createdAt. Everything after that comes from OrderStatusEvent rows written
 * going forward — orders that predate that table (or whose status changed
 * before this feature existed) simply have no further timestamped steps; we
 * still show the current status, just without inventing when it happened.
 */
export function OrderTimeline({
  createdAt,
  status,
  statusEvents,
}: {
  createdAt: string;
  status: OrderStatus;
  statusEvents: TimelineEvent[];
}) {
  const entries: { label: string; at: string | null }[] = [
    { label: "Order Placed", at: createdAt },
    ...statusEvents.map((e) => ({ label: STATUS_LABELS[e.status as OrderStatus] ?? e.status, at: e.changedAt })),
  ];

  const hasRecordedCurrentStatus = statusEvents.some((e) => e.status === status);
  if (status !== "PENDING" && !hasRecordedCurrentStatus) {
    entries.push({ label: STATUS_LABELS[status] ?? status, at: null });
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b">
        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Order Timeline</p>
      </div>
      <div className="px-4 py-3 space-y-0">
        {entries.map((entry, i) => {
          const isLast = i === entries.length - 1;
          return (
            <div key={`${entry.label}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  {entry.at ? <Check className="size-3" /> : <Circle className="size-2 fill-current" />}
                </span>
                {!isLast && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className={isLast ? "pb-0.5" : "pb-4"}>
                <p className="text-sm font-medium">{entry.label}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.at
                    ? new Date(entry.at).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Time not recorded"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
