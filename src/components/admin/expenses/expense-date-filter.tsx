"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { presetToDateStrings, resolveDateRange } from "@/lib/utils/date-range";

export type ExpenseDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "last_month";

// "year" is set only by the page's own "This Year" summary-card shortcut,
// not by anything in this picker — included here so that shared filter
// state can hold it without a type mismatch.
export interface ExpenseDateFilterValue {
  preset: ExpenseDatePreset | "custom" | "year" | "all";
  from: string; // "" when preset === "all" (no filter)
  to: string;
}

export const ALL_EXPENSE_DATES: ExpenseDateFilterValue = { preset: "all", from: "", to: "" };

const QUICK_PRESETS: { value: ExpenseDatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
];

export function ExpenseDateFilter({
  value,
  onChange,
}: {
  value: ExpenseDateFilterValue;
  onChange: (next: ExpenseDateFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState<"date" | "range" | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const isActive = value.preset !== "all";
  const label = isActive && value.from && value.to ? resolveDateRange(value.from, value.to).label : null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCustomMode(null);
      setDraftDate(value.to || "");
      setDraftFrom(value.from || "");
      setDraftTo(value.to || "");
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "h-11 w-11 shrink-0 rounded-full",
              isActive && "border-primary/50 bg-primary/5 text-primary"
            )}
            aria-label="Filter by date"
          />
        }
      >
        <CalendarIcon className="size-4.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        {label && (
          <div className="mb-2 flex items-center gap-1.5 rounded-md bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary">
            <CalendarIcon className="size-3.5" /> {label}
          </div>
        )}
        <div className="space-y-0.5">
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                const { from, to } = presetToDateStrings(p.value);
                onChange({ preset: p.value, from, to });
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                value.preset === p.value && "bg-muted font-medium"
              )}
            >
              {p.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setCustomMode((m) => (m === "date" ? null : "date"))}
            className={cn(
              "flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
              (customMode === "date" || value.preset === "custom") && "bg-muted font-medium"
            )}
          >
            Custom Date
          </button>
          {customMode === "date" && (
            <div className="flex items-center gap-2 px-1 pb-1 pt-0.5">
              <Input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="h-9 text-xs"
                aria-label="Date"
              />
              <Button
                size="sm"
                className="h-9 shrink-0"
                disabled={!draftDate}
                onClick={() => {
                  onChange({ preset: "custom", from: draftDate, to: draftDate });
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setCustomMode((m) => (m === "range" ? null : "range"))}
            className={cn(
              "flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
              customMode === "range" && "bg-muted font-medium"
            )}
          >
            Custom Date Range
          </button>
          {customMode === "range" && (
            <div className="space-y-2 px-1 pb-1 pt-0.5">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="h-9 text-xs"
                  aria-label="From date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="h-9 text-xs"
                  aria-label="To date"
                />
              </div>
              <Button
                size="sm"
                className="h-9 w-full"
                disabled={!draftFrom || !draftTo}
                onClick={() => {
                  onChange({ preset: "custom", from: draftFrom, to: draftTo });
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          )}
        </div>

        {isActive && (
          <>
            <div className="my-2 border-t" />
            <button
              type="button"
              onClick={() => {
                onChange(ALL_EXPENSE_DATES);
                setOpen(false);
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <X className="size-3.5" /> Clear Filter
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
