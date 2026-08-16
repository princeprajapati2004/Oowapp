"use client";

import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRINT_FORMATS, type PrintFormat } from "@/lib/types/print";
import { BillDocument } from "@/components/printing/bill-document";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

export function PrintPreviewClient({
  format,
  order,
  shop,
}: {
  format: PrintFormat;
  order: BillOrderData;
  shop: BillShopData;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3 print:hidden">
        <div>
          <p className="font-semibold">Print preview</p>
          <p className="text-xs text-muted-foreground">Sample data — nothing here is a real order.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={format} onValueChange={(v) => v && router.push(`/admin/print-preview?format=${v}`)}>
            <SelectTrigger className="h-9 w-56 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRINT_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print Test Page
          </Button>
        </div>
      </div>

      <div className="overflow-auto py-6">
        <div className="mx-auto w-fit shadow-lg print:shadow-none">
          <BillDocument format={format} order={order} shop={shop} />
        </div>
      </div>
    </div>
  );
}
