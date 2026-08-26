import { Check, Circle } from "lucide-react";
import { RETURN_STATUS_LABELS, type ReturnStatus } from "@/lib/return-status";

type TimelineEvent = { status: string; changedAt: string; note?: string | null };

/** Real status history only — mirrors order-timeline.tsx's pattern exactly. */
export function ReturnTimeline({
  createdAt,
  statusEvents,
}: {
  createdAt: string;
  statusEvents: TimelineEvent[];
}) {
  const entries: { label: string; at: string | null; note?: string | null }[] =
    statusEvents.length > 0
      ? statusEvents.map((e) => ({
          label: RETURN_STATUS_LABELS[e.status as ReturnStatus] ?? e.status,
          at: e.changedAt,
          note: e.note,
        }))
      : [{ label: "Return Requested", at: createdAt }];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b">
        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Return Timeline</p>
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
                {entry.note && <p className="mt-0.5 text-xs text-muted-foreground italic">{entry.note}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
