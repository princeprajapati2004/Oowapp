import { formatCurrency } from "@/lib/utils/currency";

export type ReportColumnType = "text" | "number" | "currency" | "date" | "badge";

export interface ReportColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  type?: ReportColumnType;
  // Raw value: a number for "currency"/"number" columns (so Excel gets a
  // real, SUM()-able number, not a formatted string), an ISO date string for
  // "date" columns, plain text otherwise.
  value: (row: T) => string | number | null;
  // Custom display string, for columns whose text isn't derived purely from
  // `type` (status badges, composite labels). Reserved for non-currency
  // columns — a "currency" column should rely on `type` + `value` and leave
  // this unset, so the PDF export's rupee-glyph-safe override (see
  // report-pdf.ts) can actually take effect; a `.format()` that bakes in
  // formatCurrency() directly would bypass that override.
  format?: (row: T) => string;
  // Hidden from the mobile card view when false. Desktop table always shows
  // every column. Defaults to true.
  showInCard?: boolean;
  // Relative width weight for PDF column sizing. Defaults to 1.
  width?: number;
}

// A summary-card figure. `value` stays a raw number for "currency"/"number"
// items (mirroring ReportColumn) so each renderer formats it itself — this
// is what lets the PDF export swap in the rupee-glyph-safe formatter (jsPDF's
// default font has no ₹ glyph; see report-pdf.ts) without every report
// having to build two separate summary arrays.
export interface ReportSummaryItem {
  label: string;
  value: number | string;
  type?: "currency" | "number" | "text";
  hint?: string;
}

const REPORT_DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function formatColumnValue<T>(
  column: ReportColumn<T>,
  row: T,
  options?: { currencyFormatter?: (amount: number) => string }
): string {
  if (column.format) return column.format(row);
  const raw = column.value(row);
  if (raw === null || raw === undefined || raw === "") return "-";
  switch (column.type) {
    case "currency":
      return (options?.currencyFormatter ?? formatCurrency)(Number(raw));
    case "number":
      return new Intl.NumberFormat("en-IN").format(Number(raw));
    case "date":
      return REPORT_DATE_FORMAT.format(new Date(raw));
    default:
      return String(raw);
  }
}

export function formatSummaryValue(item: ReportSummaryItem, options?: { currencyFormatter?: (amount: number) => string }): string {
  switch (item.type) {
    case "currency":
      return (options?.currencyFormatter ?? formatCurrency)(Number(item.value));
    case "number":
      return new Intl.NumberFormat("en-IN").format(Number(item.value));
    default:
      return String(item.value);
  }
}
