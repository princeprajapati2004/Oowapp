"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { CashbookReportRow, CashbookReportSummary } from "@/lib/services/reports/cashbook-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: CashbookReportSummary;
  rows: CashbookReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const SOURCE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "sale_payment", label: "Sale" },
  { value: "party_payment", label: "Payment" },
  { value: "expense", label: "Expense" },
  { value: "refund", label: "Refund" },
];

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(SOURCE_OPTIONS.map((o) => [o.value, o.label]));

const COLUMNS: ReportColumn<CashbookReportRow>[] = [
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "description", header: "Reference", type: "text", value: (r) => r.description, width: 1.6 },
  { key: "type", header: "Type", type: "text", value: (r) => r.type, width: 1.1 },
  { key: "cashIn", header: "Cash In", type: "currency", value: (r) => r.cashIn, width: 1 },
  { key: "cashOut", header: "Cash Out", type: "currency", value: (r) => r.cashOut, width: 1 },
  { key: "runningBalance", header: "Running Balance", type: "currency", value: (r) => r.runningBalance, width: 1.1 },
];

export function CashbookReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (source !== "ALL") params.set("source", source);
    if (overrides?.all) {
      params.set("all", "true");
    } else {
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
    }
    return params;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ReportApiResponse>(`/api/admin/reports/cashbook?${buildParams().toString()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, search, source, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, source]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Opening Balance", value: summary?.openingBalance ?? 0, type: "currency" },
    { label: "Total Cash In", value: summary?.totalCashIn ?? 0, type: "currency" },
    { label: "Total Cash Out", value: summary?.totalCashOut ?? 0, type: "currency" },
    { label: "Closing Balance", value: summary?.closingBalance ?? 0, type: "currency" },
  ];

  const filterSummaryParts: string[] = [];
  if (source !== "ALL") filterSummaryParts.push(`Type: ${SOURCE_LABELS[source] ?? source}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Cashbook Report" description="Every cash inflow and outflow with a running balance, oldest first." />
      <ReportPrintHeader shop={shop} reportTitle="Cashbook Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference or type"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect value={source} onValueChange={setSource} options={SOURCE_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Cashbook Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`cashbook-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/cashbook?${buildParams({ all: true }).toString()}`);
          return { rows: res.rows, total: res.total, truncated: res.truncated };
        }}
      />

      <ReportSummaryCards items={summaryCards} />

      <ReportDataTable
        columns={COLUMNS}
        rows={data?.rows ?? []}
        rowKey={(r) => r.id}
        page={data?.page ?? page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
        isLoading={loading}
        emptyMessage="No cash movements found for this filter."
      />
    </div>
  );
}
