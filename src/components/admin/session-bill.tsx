"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillDocument } from "@/components/printing/bill-document";
import { printBill } from "@/lib/printing/print-service";
import { printViaSystemDialog } from "@/lib/printing/adapters/system-print";
import type { PrintFormat } from "@/lib/types/print";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

export function SessionBill({
  format,
  order,
  shop,
}: {
  format: PrintFormat;
  order: BillOrderData;
  shop: BillShopData;
}) {
  const [printing, setPrinting] = useState(false);

  // Same dispatcher the admin Order Details "Print Receipt" button already
  // uses — routes to the shop's configured Bluetooth/WiFi/USB thermal
  // printer, falling back to the browser print dialog only when no printer
  // is configured. Previously this page only ever did window.print(),
  // silently skipping any printer the shop had actually set up.
  async function handlePrint() {
    if (printing) return;
    setPrinting(true);
    try {
      const outcome = await printBill(order, shop);
      if (!outcome.ok) {
        toast.error(outcome.error ?? "Print failed", {
          action: { label: "Print via browser", onClick: () => printViaSystemDialog() },
        });
      } else if (outcome.printer && outcome.printer.connectionType !== "SYSTEM") {
        toast.success(`Sent to ${outcome.printer.name}`);
      }
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3 print:hidden">
        <Button variant="ghost" size="icon" render={<Link href="/admin/tables" />} nativeButton={false} aria-label="Back to Tables">
          <ArrowLeft className="size-4" />
        </Button>
        <Button size="sm" className="gap-1.5" disabled={printing} onClick={handlePrint}>
          {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />} Print
        </Button>
      </div>

      <div className="overflow-auto py-6">
        <div className="mx-auto w-fit shadow-lg print:shadow-none">
          <BillDocument format={format} order={order} shop={shop} />
        </div>
      </div>
    </div>
  );
}
