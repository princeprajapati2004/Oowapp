"use client";

import { Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BillDocument } from "@/components/printing/bill-document";
import type { PrintFormat } from "@/lib/types/print";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";

/**
 * Shows the exact bill that will be sent to the printer so the user can
 * verify it before committing. Clicking "Print" hands off to the caller
 * (which calls printBill() for hardware printers or window.print() for
 * SYSTEM type — the OS print dialog for SYSTEM already has its own preview
 * on top of this one, which is fine).
 */
export function PrintPreviewModal({
  open,
  onClose,
  onConfirmPrint,
  order,
  shop,
  format,
  printing = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirmPrint: () => void;
  order: BillOrderData;
  shop: BillShopData;
  format: PrintFormat;
  printing?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !printing && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        style={{ maxHeight: "90dvh" }}
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b px-4 py-3">
          <div>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="size-4" /> Print Preview
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Review the bill before it prints.
            </p>
          </div>
          <DialogClose
            disabled={printing}
            render={<Button variant="ghost" size="icon-sm" aria-label="Close preview" />}
          >
            <X className="size-4" />
          </DialogClose>
        </DialogHeader>

        {/* Scrollable bill area — renders the exact same component that goes to the printer */}
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 py-6">
          <div className="mx-auto w-fit shadow-lg">
            <BillDocument format={format} order={order} shop={shop} />
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={printing}>
            Cancel
          </Button>
          <Button onClick={onConfirmPrint} disabled={printing} className="gap-1.5">
            {printing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Printing…
              </>
            ) : (
              <>
                <Printer className="size-4" /> Print
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
