"use client";

import { useEffect, useState } from "react";
import { Search, X, CalendarRange, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LOSS_DAMAGE_TYPES, LOSS_DAMAGE_TYPE_LABELS } from "@/lib/loss-damage-status";

export type LossDamageFilters = {
  search: string;
  type: string;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_LOSS_DAMAGE_FILTERS: LossDamageFilters = {
  search: "",
  type: "ALL",
  dateFrom: "",
  dateTo: "",
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = ["Today", "Yesterday", "This Week", "This Month"] as const;

function presetRange(preset: (typeof DATE_PRESETS)[number]): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);

  switch (preset) {
    case "Today":
      return { from: toDateStr(today), to: toDateStr(today) };
    case "Yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: toDateStr(y), to: toDateStr(y) };
    }
    case "This Week": {
      const from = new Date(today);
      from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
      return { from: toDateStr(from), to: toDateStr(today) };
    }
    case "This Month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateStr(from), to: toDateStr(today) };
    }
  }
}

export function LossDamageFiltersBar({
  filters,
  onChange,
}: {
  filters: LossDamageFilters;
  onChange: (patch: Partial<LossDamageFilters>) => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [dateOpen, setDateOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(filters.dateFrom);
  const [draftTo, setDraftTo] = useState(filters.dateTo);

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftType, setDraftType] = useState(filters.type);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) onChange({ search: searchInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeFilterCount = filters.type !== "ALL" ? 1 : 0;

  const dateLabel =
    filters.dateFrom && filters.dateTo
      ? filters.dateFrom === filters.dateTo
        ? filters.dateFrom
        : `${filters.dateFrom} → ${filters.dateTo}`
      : "Date Range";

  function openFilterSheet() {
    setDraftType(filters.type);
    setFilterSheetOpen(true);
  }

  function applyFilters() {
    onChange({ type: draftType });
    setFilterSheetOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search record ID or product"
            className="h-11 pl-8 pr-7"
            aria-label="Search loss & damage records"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className={cn("relative h-11 w-11 shrink-0", activeFilterCount > 0 && "border-primary text-primary")}
          onClick={openFilterSheet}
          aria-label="Filters"
        >
          <SlidersHorizontal className="size-4" />
          {activeFilterCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className={cn("h-11 shrink-0 gap-1.5", (filters.dateFrom || filters.dateTo) && "border-primary text-primary")}
              />
            }
          >
            <CalendarRange className="size-3.5" />
            {dateLabel}
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="grid grid-cols-2 gap-1">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    const { from, to } = presetRange(preset);
                    onChange({ dateFrom: from, dateTo: to });
                    setDraftFrom(from);
                    setDraftTo(to);
                    setDateOpen(false);
                  }}
                  className="rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="border-t pt-2.5 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Custom Range</p>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="h-8 text-xs"
                  aria-label="From date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="h-8 text-xs"
                  aria-label="To date"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={() => {
                    onChange({ dateFrom: draftFrom, dateTo: draftTo });
                    setDateOpen(false);
                  }}
                >
                  Apply
                </Button>
                {(filters.dateFrom || filters.dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      onChange({ dateFrom: "", dateTo: "" });
                      setDraftFrom("");
                      setDraftTo("");
                      setDateOpen(false);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={draftType} onValueChange={(v) => setDraftType((v as string) ?? "ALL")}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue>
                    {draftType === "ALL" ? "All Types" : LOSS_DAMAGE_TYPE_LABELS[draftType as keyof typeof LOSS_DAMAGE_TYPE_LABELS]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  {LOSS_DAMAGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{LOSS_DAMAGE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setDraftType("ALL")}>
              Reset
            </Button>
            <Button className="h-11 flex-1" onClick={applyFilters}>
              Apply Filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
