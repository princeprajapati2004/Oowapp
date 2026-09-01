import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import {
  LOSS_DAMAGE_TYPE_LABELS,
  LOSS_DAMAGE_TYPE_BADGE_CLASS,
  DAMAGE_TYPE_LABELS,
  deriveLossDamageNumber,
  type LossDamageType,
  type DamageType,
} from "@/lib/loss-damage-status";
import { deriveReturnNumber } from "@/lib/return-status";
import { cn } from "@/lib/utils";
import type { LossDamagePayload } from "@/lib/services/loss-damage";

export function LossDamageDetailPage({ record, currency }: { record: LossDamagePayload; currency: string }) {
  const type = record.type as LossDamageType;
  const date = new Date(record.date);

  return (
    <div className="-m-4 bg-background md:-m-6">
      <div className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-[620px] items-center gap-2 px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/loss-damage" />} nativeButton={false} aria-label="Back to Loss & Damage">
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="truncate text-base font-semibold">Loss & Damage Details</h1>
        </div>
      </div>

      <div className="mx-auto max-w-[620px] space-y-3 px-3 pt-3 pb-8 sm:px-4 sm:pt-4">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="font-mono text-sm font-semibold">{deriveLossDamageNumber(record.id)}</span>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", LOSS_DAMAGE_TYPE_BADGE_CLASS[type])}>
            {LOSS_DAMAGE_TYPE_LABELS[type]}
          </span>
        </div>
        <p className="px-1 text-sm text-muted-foreground">
          {date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </p>

        <div className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</p>
          <p className="text-sm font-medium">{record.productName}</p>
          {record.productCode && (
            <div className="flex items-center justify-between pt-1 text-sm">
              <span className="text-muted-foreground">Product Code</span>
              <span className="font-mono font-medium">{record.productCode}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 text-sm">
            <span className="text-muted-foreground">Quantity</span>
            <span className="font-medium">{record.quantity}</span>
          </div>
          {record.damageType && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Damage Type</span>
              <span className="font-medium">{DAMAGE_TYPE_LABELS[record.damageType as DamageType]}</span>
            </div>
          )}
          {record.createdByLabel && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recorded By</span>
              <span className="font-medium">{record.createdByLabel}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loss / Damage Value</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Purchase Price (Unit Cost)</span>
            <span className="font-medium">{record.unitCost != null ? formatCurrency(record.unitCost, currency) : "Not set"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">System Value</span>
            <span className={record.manualValue != null ? "text-muted-foreground line-through" : "font-semibold"}>
              {record.totalLossValue != null ? formatCurrency(record.totalLossValue, currency) : "—"}
            </span>
          </div>
          {record.manualValue != null && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Adjusted Value</span>
                <span className="font-semibold">{formatCurrency(record.manualValue, currency)}</span>
              </div>
              {record.manualValueReason && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reason</span>
                  <span className="font-medium">{record.manualValueReason}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inventory</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Before</span>
            <span className="font-medium">{record.inventoryBefore ?? "Not tracked"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Deducted</span>
            <span className="font-medium">{record.inventoryBefore != null ? record.quantity : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">After</span>
            <span className="font-semibold">{record.inventoryAfter ?? "Not tracked"}</span>
          </div>
        </div>

        {record.notes && (
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="text-sm">{record.notes}</p>
          </div>
        )}

        {record.evidencePhotoUrls.length > 0 && (
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence Photos</p>
            <div className="flex flex-wrap gap-2">
              {record.evidencePhotoUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="Loss/damage evidence" className="size-20 rounded-lg border object-cover" />
              ))}
            </div>
          </div>
        )}

        {record.returnId && record.returnOrderId && (
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</p>
            <p className="text-sm">
              Auto-created from{" "}
              <Link href={`/admin/returns/${record.returnId}`} className="text-primary hover:underline">
                {deriveReturnNumber(record.returnId)}
              </Link>
            </p>
          </div>
        )}

        <p className="pb-1 text-center text-xs text-muted-foreground">Record ID: {record.id}</p>
      </div>
    </div>
  );
}
