"use client";

import { useEffect, useState } from "react";
import { Search, X, CalendarRange, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ORDER_STATUSES, PAYMENT_STATUSES, STATUS_LABELS, PAYMENT_LABELS } from "@/lib/order-status";

export type OrderFilters = {
  search: string;
  status: string;
  paymentStatus: string;
  type: string;
  source: string;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  search: "",
  status: "ALL",
  paymentStatus: "ALL",
  type: "ALL",
  source: "ALL",
  dateFrom: "",
  dateTo: "",
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  "Today",
  "Yesterday",
  "This Week",
  "Last Week",
  "This Month",
  "Last Month",
  "This Year",
  "Last Year",
] as const;

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
      from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); // Monday start
      return { from: toDateStr(from), to: toDateStr(today) };
    }
    case "Last Week": {
      const from = new Date(today);
      from.setDate(from.getDate() - ((from.getDay() + 6) % 7) - 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return { from: toDateStr(from), to: toDateStr(to) };
    }
    case "This Month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateStr(from), to: toDateStr(today) };
    }
    case "Last Month": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toDateStr(from), to: toDateStr(to) };
    }
    case "This Year": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from: toDateStr(from), to: toDateStr(today) };
    }
    case "Last Year": {
      const from = new Date(today.getFullYear() - 1, 0, 1);
      const to = new Date(today.getFullYear() - 1, 11, 31);
      return { from: toDateStr(from), to: toDateStr(to) };
    }
  }
}

const TYPE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "delivery", label: "Delivery" },
  { value: "dine-in", label: "Dine-in" },
  { value: "takeaway", label: "Takeaway" },
];

const SOURCE_OPTIONS = [
  { value: "ALL", label: "All Sources" },
  { value: "manual", label: "Manual" },
  { value: "online", label: "Online / QR" },
];

export function OrderFiltersBar({
  filters,
  onChange,
}: {
  filters: OrderFilters;
  onChange: (patch: Partial<OrderFilters>) => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [dateOpen, setDateOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(filters.dateFrom);
  const [draftTo, setDraftTo] = useState(filters.dateTo);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) onChange({ search: searchInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasActiveFilters =
    filters.status !== "ALL" ||
    filters.paymentStatus !== "ALL" ||
    filters.type !== "ALL" ||
    filters.source !== "ALL" ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  const dateLabel =
    filters.dateFrom && filters.dateTo
      ? filters.dateFrom === filters.dateTo
        ? filters.dateFrom
        : `${filters.dateFrom} → ${filters.dateTo}`
      : "Date Range";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search bill no., customer name, or phone…"
          className="h-9 pl-8 pr-7"
          aria-label="Search orders"
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

      <Select value={filters.status} onValueChange={(v) => onChange({ status: v ?? "ALL" })}>
        <SelectTrigger className="h-9 w-36">
          <SelectValue>{filters.status === "ALL" ? "All Statuses" : STATUS_LABELS[filters.status as keyof typeof STATUS_LABELS]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Statuses</SelectItem>
          {ORDER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.paymentStatus} onValueChange={(v) => onChange({ paymentStatus: v ?? "ALL" })}>
        <SelectTrigger className="h-9 w-32">
          <SelectValue>{filters.paymentStatus === "ALL" ? "All Payments" : PAYMENT_LABELS[filters.paymentStatus as keyof typeof PAYMENT_LABELS]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Payments</SelectItem>
          {PAYMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{PAYMENT_LABELS[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.type} onValueChange={(v) => onChange({ type: v ?? "ALL" })}>
        <SelectTrigger className="h-9 w-32">
          <SelectValue>{TYPE_OPTIONS.find((o) => o.value === filters.type)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.source} onValueChange={(v) => onChange({ source: v ?? "ALL" })}>
        <SelectTrigger className="h-9 w-36">
          <SelectValue>{SOURCE_OPTIONS.find((o) => o.value === filters.source)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SOURCE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className={cn("h-9 gap-1.5", (filters.dateFrom || filters.dateTo) && "border-primary text-primary")} />
          }
        >
          <CalendarRange className="size-3.5" />
          {dateLabel}
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
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

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-muted-foreground"
          onClick={() => {
            onChange({ status: "ALL", paymentStatus: "ALL", type: "ALL", source: "ALL", dateFrom: "", dateTo: "" });
            setDraftFrom("");
            setDraftTo("");
          }}
        >
          <SlidersHorizontal className="size-3.5" /> Clear filters
        </Button>
      )}
    </div>
  );
}
