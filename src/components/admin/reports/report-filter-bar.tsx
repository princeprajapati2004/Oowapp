"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReportDateRangePicker, type ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

export function ReportFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  dateRange,
  onDateRangeChange,
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  dateRange: ReportDateRangeValue;
  onDateRangeChange: (value: ReportDateRangeValue) => void;
  children?: ReactNode;
}) {
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) onSearchChange(searchInput);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 pl-8 pr-7"
          aria-label={searchPlaceholder}
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
      <ReportDateRangePicker value={dateRange} onChange={onDateRangeChange} />
      {children}
    </div>
  );
}
