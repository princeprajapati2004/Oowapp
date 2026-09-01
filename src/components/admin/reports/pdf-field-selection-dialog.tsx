"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface PdfFieldOption {
  key: string;
  header: string;
}

/**
 * Field picker shown before generating a report PDF (Reports Center spec) —
 * every selectable field is a real ReportColumn already used to render the
 * on-screen table/Excel/CSV, so this never changes the underlying report
 * data, only which columns the PDF draws. All fields start selected, same
 * as the "Select All" default called for in the spec.
 */
export function PdfFieldSelectionDialog({
  open,
  onOpenChange,
  fields,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: PdfFieldOption[];
  onGenerate: (selectedKeys: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(fields.map((f) => f.key)));
  // Tracks `open` to detect the closed->open transition during render (the
  // React-recommended way to "adjust state when a prop changes" without an
  // effect — see https://react.dev/learn/you-might-not-need-an-effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    // Reset to "all selected" each time the dialog opens — a one-off export
    // preference, not a saved setting that should silently narrow the next
    // owner's PDF.
    if (open) setSelected(new Set(fields.map((f) => f.key)));
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>Select fields for PDF</DialogTitle>
          <DialogDescription>Choose which columns appear in the generated PDF.</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2 border-b px-5 py-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set(fields.map((f) => f.key)))}>
            Select All
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear All
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {selected.size} of {fields.length} selected
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-0.5">
            {fields.map((field) => (
              <label
                key={field.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
              >
                <Checkbox checked={selected.has(field.key)} onCheckedChange={() => toggle(field.key)} />
                <Label className="cursor-pointer text-sm font-normal">{field.header}</Label>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/50 px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={selected.size === 0} onClick={() => onGenerate(fields.map((f) => f.key).filter((k) => selected.has(k)))}>
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
