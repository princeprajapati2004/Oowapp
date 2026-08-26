"use client";

import { Minus, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { computeReturnableQuantity } from "@/lib/services/return-eligibility";

export type ReturnPickerItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  returnedQuantity: number;
};

/**
 * Shared item + quantity selector for both the owner and customer return
 * request forms — caps each item's stepper at
 * `quantity - returnedQuantity` (the server enforces the same cap
 * authoritatively; this is purely a UX guard against an impossible submit).
 */
export function ReturnItemPicker({
  items,
  selected,
  onChange,
  currency,
}: {
  items: ReturnPickerItem[];
  selected: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  currency: string;
}) {
  const eligibleItems = items.filter((item) => computeReturnableQuantity(item) > 0);

  function toggle(item: ReturnPickerItem, checked: boolean) {
    const next = { ...selected };
    if (checked) next[item.id] = 1;
    else delete next[item.id];
    onChange(next);
  }

  function setQty(item: ReturnPickerItem, qty: number) {
    const max = computeReturnableQuantity(item);
    const next = { ...selected, [item.id]: Math.min(Math.max(qty, 1), max) };
    onChange(next);
  }

  if (eligibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">No items are eligible for return on this order.</p>;
  }

  return (
    <div className="space-y-2">
      {eligibleItems.map((item) => {
        const max = computeReturnableQuantity(item);
        const checked = item.id in selected;
        const qty = selected[item.id] ?? 1;
        return (
          <div key={item.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <Checkbox checked={checked} onCheckedChange={(v) => toggle(item, v === true)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(item.price, currency)} · {max} of {item.quantity} available
              </p>
            </div>
            {checked && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={() => setQty(item, qty - 1)}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-5 text-center text-sm font-medium">{qty}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={() => setQty(item, qty + 1)}
                  disabled={qty >= max}
                  aria-label="Increase quantity"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
