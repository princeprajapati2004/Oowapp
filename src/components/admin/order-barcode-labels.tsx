"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarcodeSvg } from "@/components/shared/barcode-svg";

export function OrderBarcodeLabels({
  billNumber,
  businessName,
  items,
}: {
  billNumber: string;
  businessName: string;
  items: { id: string; name: string; quantity: number }[];
}) {
  // One physical sticker per unit — an item ordered ×5 needs 5 labels to put
  // on 5 containers, not one card with "Qty 5" printed as text (same bug
  // class as the standalone Barcodes page). Each unit gets its own traceable
  // code, matching the existing per-line-item code scheme.
  const labels = items.flatMap((item, lineIndex) =>
    Array.from({ length: item.quantity }, (_, unitIndex) => ({
      key: `${item.id}-${unitIndex}`,
      name: item.name,
      code: `${billNumber}-${lineIndex + 1}-${unitIndex + 1}`,
      unitIndex: unitIndex + 1,
      quantity: item.quantity,
    }))
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">Barcode labels</h1>
          <p className="text-sm text-muted-foreground">
            Order #{billNumber} · {labels.length} label{labels.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => window.print()} className="gap-1.5">
          <Printer className="size-4" /> Print
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
        {labels.map((label) => (
          <div
            key={label.key}
            className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border p-3 text-center print:rounded-none print:border-black"
          >
            <p className="text-xs font-semibold uppercase tracking-wide">{businessName}</p>
            <BarcodeSvg value={label.code} />
            <p className="text-sm font-medium leading-tight">{label.name}</p>
            <p className="text-xs text-muted-foreground">
              {label.quantity > 1 ? `Unit ${label.unitIndex} of ${label.quantity} · ` : ""}
              Order #{billNumber}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
