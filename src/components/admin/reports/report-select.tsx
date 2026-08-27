"use client";

import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export interface ReportSelectOption {
  value: string;
  label: string;
}

/**
 * Base UI's <Select> only reliably tracks a controlled `value` (and resolves
 * the trigger's label) via an explicit `items` value->label map — passing
 * children into <Select.Value> directly instead silently loses the
 * selection once a second <Select> on the page opens (confirmed both here
 * and in the pre-existing expense-form.tsx, which documents the same fix).
 * Every report filter dropdown should use this wrapper rather than
 * `<Select>` directly, so that footgun can't recur report by report.
 */
export function ReportSelect({
  value,
  onValueChange,
  options,
  className = "h-10 w-full",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ReportSelectOption[];
  className?: string;
}) {
  const items = useMemo(() => {
    const map: Record<string, string> = {};
    for (const o of options) map[o.value] = o.label;
    return map;
  }, [options]);

  return (
    <Select value={value} onValueChange={(v) => onValueChange(typeof v === "string" ? v : value)} items={items}>
      <SelectTrigger className={className}>
        <span data-slot="select-value" className="flex flex-1 truncate text-left">
          {items[value] ?? options[0]?.label ?? ""}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
