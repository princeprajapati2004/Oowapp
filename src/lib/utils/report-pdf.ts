import type { jsPDF } from "jspdf";
import { formatColumnValue, formatSummaryValue, type ReportColumn, type ReportSummaryItem } from "@/lib/utils/report-columns";

export interface ReportPdfShopMeta {
  businessName: string;
  address?: string | null;
  gstNumber?: string | null;
  phone?: string | null;
}

export interface ReportPdfMeta {
  shop: ReportPdfShopMeta;
  reportTitle: string;
  dateRangeLabel: string;
  filterSummary?: string;
}

const MARGIN = 40;
const ROW_HEIGHT = 14;
const HEADER_FONT_SIZE = 8;
const ROW_FONT_SIZE = 8;

/**
 * jsPDF's standard fonts (Helvetica etc., WinAnsiEncoding) have no glyph for
 * the Rupee sign U+20B9 — confirmed empirically: it has no entry anywhere in
 * jsPDF's bundled font metrics/encoding tables, unlike invoice-pdf.ts's
 * existing (untouched) usage of formatCurrency(), which silently inherits
 * this same risk. "Rs." keeps the exact en-IN digit grouping
 * (1,25,000.00) without depending on a glyph the default font can't render.
 * Excel/CSV/on-screen/print are unaffected — they use the real formatCurrency
 * (₹) since HTML and Excel's default fonts both support the glyph natively.
 */
function formatCurrencyPdfSafe(amount: number): string {
  return `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

/**
 * jsPDF's standard fonts are missing glyphs for more than just the rupee
 * sign — confirmed empirically (see the rupee spike above) that em dash
 * (—), en dash (–) and the Unicode minus sign (−) all report the exact same
 * "no real glyph" fallback width jsPDF uses for an unmapped character,
 * unlike a plain ASCII hyphen. Report copy (hints, disclaimers, labels)
 * regularly uses these in ordinary prose — e.g. "Assets − Liabilities" or
 * "5 products excluded — no cost price set" — so every string drawn into
 * the PDF is routed through this sanitizer rather than requiring each
 * report's copy to avoid the characters (which broke once already, in the
 * Balance Sheet's "Implied Equity (Assets − Liabilities)" label, before
 * this existed). Excel/CSV/on-screen/print are unaffected — HTML and
 * Excel's default fonts render all of these correctly.
 */
function pdfSafeText(text: string): string {
  return text.replace(/[—]/g, " - ").replace(/[–−]/g, "-");
}

function truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(truncated + "...") > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

function computeColumnLayout<T>(pageWidth: number, columns: ReportColumn<T>[]) {
  const usableWidth = pageWidth - MARGIN * 2;
  const totalWeight = columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  const widths = columns.map((c) => ((c.width ?? 1) / totalWeight) * usableWidth);
  const xPositions: number[] = [];
  let x = MARGIN;
  for (const w of widths) {
    xPositions.push(x);
    x += w;
  }
  return { widths, xPositions };
}

function alignFor<T>(column: ReportColumn<T>): "left" | "right" | "center" {
  if (column.align) return column.align;
  return column.type === "currency" || column.type === "number" ? "right" : "left";
}

export interface GenerateReportPdfParams<T> {
  meta: ReportPdfMeta;
  columns: ReportColumn<T>[];
  rows: T[];
  summary: ReportSummaryItem[];
  fileName: string;
}

/**
 * Generalizes the header/footer/table drawing already established by
 * invoice-pdf.ts into a reusable, paginated table renderer — the thing that
 * file explicitly lacks (no doc.addPage() calls, assumes everything fits on
 * one page). Every printed page repeats a condensed business/report header
 * and the table's column headers, so a page pulled out of a printed stack
 * still self-identifies (report name, period, business) — the CA-friendly
 * requirement from the spec.
 */
export async function generateReportPdf<T>({ meta, columns, rows, summary, fileName }: GenerateReportPdfParams<T>): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { widths, xPositions } = computeColumnLayout(pageWidth, columns);

  function drawFullHeader(): number {
    let y = MARGIN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(pdfSafeText(meta.shop.businessName), pageWidth / 2, y, { align: "center" });
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    if (meta.shop.address) {
      doc.text(pdfSafeText(meta.shop.address), pageWidth / 2, y, { align: "center" });
      y += 11;
    }
    const contactLine = [meta.shop.phone, meta.shop.gstNumber ? `GSTIN: ${meta.shop.gstNumber}` : null].filter(Boolean).join("  |  ");
    if (contactLine) {
      doc.text(pdfSafeText(contactLine), pageWidth / 2, y, { align: "center" });
      y += 11;
    }
    y += 6;

    doc.setDrawColor(200);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(pdfSafeText(meta.reportTitle), pageWidth / 2, y, { align: "center" });
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(pdfSafeText(meta.dateRangeLabel), pageWidth / 2, y, { align: "center" });
    y += 12;

    if (meta.filterSummary) {
      doc.setFontSize(8);
      doc.text(pdfSafeText(meta.filterSummary), pageWidth / 2, y, { align: "center" });
      y += 12;
    }
    y += 6;
    return y;
  }

  function drawContinuationHeader(): number {
    let y = MARGIN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(pdfSafeText(`${meta.shop.businessName} - ${meta.reportTitle}`), MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(pdfSafeText(meta.dateRangeLabel), pageWidth - MARGIN, y, { align: "right" });
    y += 10;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 14;
    return y;
  }

  // Summary-card hints carry the report's honesty disclosures (excluded-
  // product counts, the Cash & Bank bucket-inference caveat, refund
  // inclusion notes, etc.) — the on-screen ReportSummaryCards already shows
  // these, so a PDF handed to an accountant must carry the same caveats
  // rather than silently dropping them. Each pair-row's height grows to fit
  // a wrapped hint line under whichever item(s) in that row have one.
  function drawSummaryBlock(startY: number): number {
    if (summary.length === 0) return startY;
    let y = startY;
    const colWidth = (pageWidth - MARGIN * 2) / 2;
    const hintWidth = colWidth - 14;

    for (let i = 0; i < summary.length; i += 2) {
      const rowItems = [summary[i], summary[i + 1]].filter((item): item is ReportSummaryItem => item != null);
      const hintLines = rowItems.map((item) => (item.hint ? doc.splitTextToSize(pdfSafeText(item.hint), hintWidth) : []));
      const rowHeight = 14 + Math.max(0, ...hintLines.map((lines) => lines.length)) * 9;

      rowItems.forEach((item, col) => {
        const x = MARGIN + col * colWidth;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(pdfSafeText(item.label), x, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(pdfSafeText(formatSummaryValue(item, { currencyFormatter: formatCurrencyPdfSafe })), x + colWidth - 10, y, { align: "right" });

        if (hintLines[col].length > 0) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(130);
          doc.text(hintLines[col], x, y + 9);
        }
      });

      y += rowHeight;
    }

    y += 6;
    doc.setDrawColor(220);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    return y + 16;
  }

  function drawTableHeader(startY: number): number {
    let y = startY;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(HEADER_FONT_SIZE);
    doc.setTextColor(0);
    columns.forEach((col, i) => {
      const align = alignFor(col);
      const x = align === "right" ? xPositions[i] + widths[i] - 4 : align === "center" ? xPositions[i] + widths[i] / 2 : xPositions[i];
      doc.text(pdfSafeText(col.header), x, y, { align });
    });
    y += 6;
    doc.setDrawColor(150);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(ROW_FONT_SIZE);
    return y;
  }

  let y = drawFullHeader();
  y = drawSummaryBlock(y);
  y = drawTableHeader(y);

  for (const row of rows) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = drawContinuationHeader();
      y = drawTableHeader(y);
    }
    doc.setTextColor(0);
    columns.forEach((col, i) => {
      const text = pdfSafeText(formatColumnValue(col, row, { currencyFormatter: formatCurrencyPdfSafe }));
      const displayText = truncateToWidth(doc, text, widths[i] - 6);
      const align = alignFor(col);
      const x = align === "right" ? xPositions[i] + widths[i] - 4 : align === "center" ? xPositions[i] + widths[i] / 2 : xPositions[i];
      doc.text(displayText, x, y, { align });
    });
    y += ROW_HEIGHT;
  }

  const totalPages = doc.getNumberOfPages();
  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated ${generatedAt} - Oowapp`, MARGIN, pageHeight - 20);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - MARGIN, pageHeight - 20, { align: "right" });
  }

  doc.save(fileName);
}
