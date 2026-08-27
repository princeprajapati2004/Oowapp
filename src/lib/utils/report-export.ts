import * as XLSX from "xlsx";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";

export interface ReportExportMeta {
  businessName: string;
  reportTitle: string;
  dateRangeLabel: string;
  filterSummary?: string;
}

function rawCellValue<T>(column: ReportColumn<T>, row: T): string | number | null {
  const raw = column.value(row);
  if (raw === null || raw === undefined) return column.type === "currency" || column.type === "number" ? null : "";
  if (column.type === "currency" || column.type === "number") return Number(raw);
  return String(raw);
}

/**
 * Excel export: a title/meta block (business name, report, period) + summary
 * cards, then the header row + data rows with currency/number columns as
 * real numeric cells (not formatted strings) so totals are SUM()-able in
 * Excel — a `formatCurrency()` string like "₹1,25,000.00" would import as
 * text and break that. Uses the `xlsx` package already in package.json, no
 * new dependency.
 */
export function exportReportExcel<T>({
  meta,
  columns,
  rows,
  summary,
  fileName,
}: {
  meta: ReportExportMeta;
  columns: ReportColumn<T>[];
  rows: T[];
  summary: ReportSummaryItem[];
  fileName: string;
}): void {
  const aoa: (string | number | null)[][] = [];
  aoa.push([meta.businessName]);
  aoa.push([meta.reportTitle]);
  aoa.push([meta.dateRangeLabel]);
  if (meta.filterSummary) aoa.push([meta.filterSummary]);
  aoa.push([]);

  const summaryNumberCellRefs: { ref: string; format: string }[] = [];
  if (summary.length > 0) {
    summary.forEach((item) => {
      const rowIndex = aoa.length;
      const isNumeric = item.type === "currency" || item.type === "number";
      aoa.push([item.label, isNumeric ? Number(item.value) : String(item.value)]);
      if (isNumeric) {
        summaryNumberCellRefs.push({
          ref: XLSX.utils.encode_cell({ r: rowIndex, c: 1 }),
          format: item.type === "currency" ? "#,##0.00" : "#,##0",
        });
      }
    });
    aoa.push([]);
  }

  const headerRowIndex = aoa.length;
  aoa.push(columns.map((c) => c.header));
  rows.forEach((row) => {
    aoa.push(columns.map((c) => rawCellValue(c, row)));
  });

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  summaryNumberCellRefs.forEach(({ ref, format }) => {
    const cell = worksheet[ref];
    if (cell && typeof cell.v === "number") cell.z = format;
  });
  columns.forEach((col, colIdx) => {
    if (col.type !== "currency" && col.type !== "number") return;
    for (let r = headerRowIndex + 1; r < aoa.length; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: colIdx });
      const cell = worksheet[cellRef];
      if (cell && typeof cell.v === "number") {
        cell.z = col.type === "currency" ? "#,##0.00" : "#,##0";
      }
    }
  });
  worksheet["!cols"] = columns.map(() => ({ wch: 18 }));

  const workbook = XLSX.utils.book_new();
  const sheetName = meta.reportTitle.slice(0, 31) || "Report";
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

/**
 * CSV export deliberately skips the title/summary block Excel gets — CSV is
 * mainly consumed by accounting-import tools that expect flat header+rows
 * data, not a report document.
 */
export function exportReportCsv<T>({ columns, rows, fileName }: { columns: ReportColumn<T>[]; rows: T[]; fileName: string }): void {
  const aoa: (string | number | null)[][] = [columns.map((c) => c.header)];
  rows.forEach((row) => {
    aoa.push(columns.map((c) => rawCellValue(c, row)));
  });
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
