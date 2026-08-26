import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { formatOrderDateParts } from "@/lib/utils/date";
import { LOSS_DAMAGE_TYPE_LABELS, LOSS_DAMAGE_TYPE_BADGE_CLASS, deriveLossDamageNumber, type LossDamageType } from "@/lib/loss-damage-status";
import type { LossDamagePayload } from "@/lib/services/loss-damage";

export function LossDamageCard({ record, currency }: { record: LossDamagePayload; currency: string }) {
  const type = record.type as LossDamageType;
  const { date, dayTime } = formatOrderDateParts(record.date);

  return (
    <Link
      href={`/admin/loss-damage/${record.id}`}
      className="block w-full text-left rounded-xl border bg-card px-4 py-3.5 hover:bg-muted/40 hover:border-border transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{deriveLossDamageNumber(record.id)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{date} · {dayTime}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>

      <p className="mt-2 truncate text-sm">{record.productName} × {record.quantity}</p>
      {record.returnId && <p className="text-xs text-muted-foreground">Linked to return {record.returnId}</p>}

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${LOSS_DAMAGE_TYPE_BADGE_CLASS[type]}`}
        >
          {LOSS_DAMAGE_TYPE_LABELS[type]}
        </span>
        <span className="whitespace-nowrap text-sm font-semibold">
          {record.totalLossValue != null ? formatCurrency(record.totalLossValue, currency) : "—"}
        </span>
      </div>
    </Link>
  );
}
