"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillDocument } from "@/components/printing/bill-document";
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
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3 print:hidden">
        <Button variant="ghost" size="icon" render={<Link href="/admin/tables" />} nativeButton={false} aria-label="Back to Tables">
          <ArrowLeft className="size-4" />
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="size-4" /> Print
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
