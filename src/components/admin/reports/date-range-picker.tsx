"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { REPORT_DATE_PRESETS, presetToDateStrings, type ReportDatePreset } from "@/lib/utils/date-range";

export interface ReportDateRangeValue {
  preset: ReportDatePreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export function ReportDateRangePicker({
  value,
  onChange,
}: {
  value: ReportDateRangeValue;
  onChange: (next: ReportDateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  const label =
    value.preset !== "custom"
      ? REPORT_DATE_PRESETS.find((p) => p.value === value.preset)?.label
      : value.from === value.to
        ? value.from
        : `${value.from} to ${value.to}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraftFrom(value.from);
          setDraftTo(value.to);
        }
      }}
    >
      <PopoverTrigger render={<Button variant="outline" className="h-10 shrink-0 gap-1.5" />}>
        <CalendarRange className="size-3.5" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="grid grid-cols-2 gap-1">
          {REPORT_DATE_PRESETS.filter((p) => p.value !== "custom").map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                const { from, to } = presetToDateStrings(preset.value as Exclude<ReportDatePreset, "custom">);
                onChange({ preset: preset.value, from, to });
                setOpen(false);
              }}
              className={cn(
                "rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                value.preset === preset.value && "bg-muted font-medium"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-2 space-y-2 border-t pt-2.5">
          <p className="text-xs font-medium text-muted-foreground">Custom Date</p>
          <div className="flex items-center gap-2">
            <Input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="h-8 text-xs" aria-label="From date" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="h-8 text-xs" aria-label="To date" />
          </div>
          <Button
            size="sm"
            className="h-8 w-full text-xs"
            disabled={!draftFrom || !draftTo}
            onClick={() => {
              onChange({ preset: "custom", from: draftFrom, to: draftTo });
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
