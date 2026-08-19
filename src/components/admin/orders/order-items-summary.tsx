import { ReceiptText } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import type { BillOrderItem, TaxLine } from "@/lib/hooks/use-bill-actions";

/**
 * Item list + subtotal/discount/tax/total breakdown — shared by the order
 * detail drawer and the full bill page so pricing display logic exists in
 * exactly one place (brief: "Items Ordered" + price summary sections).
 */
export function OrderItemsSummary({
  items,
  subtotal,
  taxTotal,
  taxBreakdown,
  discountType,
  discountValue,
  discountedTotal,
  discountReason,
  currency,
  compact,
}: {
  items: BillOrderItem[];
  subtotal: number;
  taxTotal: number;
  taxBreakdown: TaxLine[];
  discountType: string | null;
  discountValue: number | null;
  discountedTotal: number | null;
  discountReason?: string | null;
  currency: string;
  compact?: boolean;
}) {
  const base = subtotal + taxTotal;
  const finalTotal = discountedTotal ?? base;
  const discountAmt = discountedTotal !== null ? base - discountedTotal : 0;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b bg-muted/30">
        <ReceiptText className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items Ordered</p>
      </div>

      <div className="divide-y">
        {items.map((item) => (
          <div key={item.id} className={compact ? "flex items-start justify-between gap-3 px-4 py-2.5" : "flex items-start justify-between gap-3 px-4 py-3"}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                Qty: {item.quantity} • {formatCurrency(item.price, currency)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold">{formatCurrency(item.lineTotal, currency)}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-t bg-muted/20 px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        {taxBreakdown.map((line) => (
          <div key={line.id} className="flex justify-between text-muted-foreground">
            <span>{line.name}</span>
            <span>{formatCurrency(line.amount, currency)}</span>
          </div>
        ))}
        {discountType && discountAmt > 0 ? (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>
              {discountType === "PERCENTAGE" ? `Discount (${discountValue}%)` : "Discount"}
              {discountReason ? ` — ${discountReason}` : ""}
            </span>
            <span className="font-medium">−{formatCurrency(discountAmt, currency)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
          <span>Total Amount</span>
          <span className="text-primary">{formatCurrency(finalTotal, currency)}</span>
        </div>
      </div>
    </div>
  );
}
