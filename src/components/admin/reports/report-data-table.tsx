"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatColumnValue, type ReportColumn } from "@/lib/utils/report-columns";

function alignClass(align?: "left" | "right" | "center") {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "";
}

export function ReportDataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  pageSize,
  total,
  onPageChange,
  emptyMessage = "No records found for this filter.",
  isLoading = false,
}: {
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto rounded-lg ring-1 ring-foreground/10 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={alignClass(col.align ?? (col.type === "currency" || col.type === "number" ? "right" : "left"))}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={alignClass(col.align ?? (col.type === "currency" || col.type === "number" ? "right" : "left"))}>
                    {formatColumnValue(col, row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.length === 0 && !isLoading && <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>}
        {rows.map((row) => (
          <div key={rowKey(row)} className="space-y-1.5 rounded-lg p-3 ring-1 ring-foreground/10">
            {columns
              .filter((c) => c.showInCard !== false)
              .map((col) => (
                <div key={col.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{col.header}</span>
                  <span className="text-right font-medium">{formatColumnValue(col, row)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {total > pageSize && (
        <div className={cn("flex items-center justify-between gap-2 text-sm print:hidden")}>
          <p className="text-muted-foreground">
            Page {page} of {totalPages} - {total.toLocaleString("en-IN")} records
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
