"use client";

import { useState } from "react";
import { FileText, FileSpreadsheet, FileDown, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import { generateReportPdf, type ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import { exportReportExcel, exportReportCsv } from "@/lib/utils/report-export";
import { PdfFieldSelectionDialog } from "@/components/admin/reports/pdf-field-selection-dialog";

export interface ReportExportFetchResult<T> {
  rows: T[];
  total: number;
  truncated: boolean;
}

/**
 * PDF/Excel/CSV/Print for a report page. `fetchAllRows` must return the
 * FULL currently-filtered dataset (not just the on-screen page) — every
 * export button here uses it, so exports always match whatever date range,
 * search and filters are applied on screen at the moment of export.
 */
export function ReportExportButtons<T>({
  reportTitle,
  dateRangeLabel,
  filterSummary,
  shop,
  columns,
  summary,
  fetchAllRows,
  fileBaseName,
}: {
  reportTitle: string;
  dateRangeLabel: string;
  filterSummary?: string;
  shop: ReportPdfShopMeta;
  columns: ReportColumn<T>[];
  summary: ReportSummaryItem[];
  fetchAllRows: () => Promise<ReportExportFetchResult<T>>;
  fileBaseName: string;
}) {
  const [busy, setBusy] = useState<"pdf" | "excel" | "csv" | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);

  async function withRows(kind: "pdf" | "excel" | "csv", run: (rows: T[]) => void) {
    setBusy(kind);
    try {
      const { rows, truncated, total } = await fetchAllRows();
      if (truncated) {
        window.alert(
          `Showing the first ${rows.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} matching records — narrow your date range for a complete export.`
        );
      }
      run(rows);
    } finally {
      setBusy(null);
    }
  }

  function generatePdfWithFields(selectedKeys: string[]) {
    setFieldPickerOpen(false);
    const selectedSet = new Set(selectedKeys);
    // Filter, never reorder — keeps the PDF's column order identical to the
    // on-screen table regardless of which fields were dropped.
    const pdfColumns = columns.filter((c) => selectedSet.has(c.key));
    withRows("pdf", (rows) =>
      generateReportPdf({
        meta: { shop, reportTitle, dateRangeLabel, filterSummary },
        columns: pdfColumns,
        rows,
        summary,
        fileName: `${fileBaseName}.pdf`,
      })
    );
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setFieldPickerOpen(true)}>
        {busy === "pdf" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
        PDF
      </Button>
      <PdfFieldSelectionDialog
        open={fieldPickerOpen}
        onOpenChange={setFieldPickerOpen}
        fields={columns.map((c) => ({ key: c.key, header: c.header }))}
        onGenerate={generatePdfWithFields}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() =>
          withRows("excel", (rows) =>
            exportReportExcel({
              meta: { businessName: shop.businessName, reportTitle, dateRangeLabel, filterSummary },
              columns,
              rows,
              summary,
              fileName: `${fileBaseName}.xlsx`,
            })
          )
        }
      >
        {busy === "excel" ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => withRows("csv", (rows) => exportReportCsv({ columns, rows, fileName: `${fileBaseName}.csv` }))}
      >
        {busy === "csv" ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-3.5" />
        Print
      </Button>
    </div>
  );
}
