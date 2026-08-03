"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      width: 1.6,
      height: 50,
      displayValue: false,
      margin: 0,
    });
  }, [value]);

  return <svg ref={ref} />;
}

export function OrderBarcodeLabels({
  billNumber,
  businessName,
  items,
}: {
  billNumber: string;
  businessName: string;
  items: { id: string; name: string; quantity: number }[];
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">Barcode labels</h1>
          <p className="text-sm text-muted-foreground">
            Order #{billNumber} · {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => window.print()} className="gap-1.5">
          <Printer className="size-4" /> Print
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border p-3 text-center print:rounded-none print:border-black"
          >
            <p className="text-xs font-semibold uppercase tracking-wide">{businessName}</p>
            <BarcodeSvg value={`${billNumber}-${index + 1}`} />
            <p className="text-sm font-medium leading-tight">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              Qty {item.quantity} · Order #{billNumber}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
