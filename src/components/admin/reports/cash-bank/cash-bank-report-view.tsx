"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { CashBankReportRow, CashBankReportSummary } from "@/lib/services/reports/cash-bank-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: CashBankReportSummary;
  rows: CashBankReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const BUCKET_OPTIONS = [
  { value: "ALL", label: "All Buckets" },
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank / Digital" },
  { value: "UNKNOWN", label: "Unknown" },
];

const BUCKET_LABELS: Record<string, string> = { CASH: "Cash", BANK: "Bank / Digital", UNKNOWN: "Unknown" };

// The exact disclaimer required by the Reports Center plan for this report —
// Cash vs Bank/Digital comes from cashBankBucket()'s static CASH/COD-vs-
// everything-else text mapping, not a real linked bank account.
const BUCKET_DISCLAIMER =
  "Cash vs Bank/Digital is inferred from each transaction's payment-method text, not a linked bank account — treat this split as directionally accurate, not bank-reconciliation-grade.";

const COLUMNS: ReportColumn<CashBankReportRow>[] = [
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  {
    key: "bucket",
    header: "Bucket",
    type: "text",
    value: (r) => r.bucket,
    format: (r) => BUCKET_LABELS[r.bucket] ?? r.bucket,
    width: 0.9,
  },
  { key: "method", header: "Method", type: "text", value: (r) => r.method, width: 0.9 },
  { key: "type", header: "Type", type: "text", value: (r) => r.type, width: 1 },
  { key: "amountIn", header: "In", type: "currency", value: (r) => r.amountIn, width: 1 },
  { key: "amountOut", header: "Out", type: "currency", value: (r) => r.amountOut, width: 1 },
];

export function CashBankReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (bucket !== "ALL") params.set("bucket", bucket);
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
      .get<ReportApiResponse>(`/api/admin/reports/cash-bank?${buildParams().toString()}`)
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
  }, [dateRange, search, bucket, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, bucket]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Opening Cash", value: summary?.openingCash ?? 0, type: "currency" },
    { label: "Cash In", value: summary?.cashIn ?? 0, type: "currency" },
    { label: "Cash Out", value: summary?.cashOut ?? 0, type: "currency" },
    { label: "Current Cash", value: summary?.currentCash ?? 0, type: "currency", hint: BUCKET_DISCLAIMER },
    { label: "Opening Bank / Digital", value: summary?.openingBank ?? 0, type: "currency" },
    { label: "Bank / Digital In", value: summary?.bankIn ?? 0, type: "currency" },
    { label: "Bank / Digital Out", value: summary?.bankOut ?? 0, type: "currency" },
    { label: "Current Bank / Digital", value: summary?.currentBank ?? 0, type: "currency", hint: BUCKET_DISCLAIMER },
  ];

  const filterSummaryParts: string[] = [];
  if (bucket !== "ALL") filterSummaryParts.push(`Bucket: ${BUCKET_LABELS[bucket] ?? bucket}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Cash & Bank Report" description={BUCKET_DISCLAIMER} />
      <ReportPrintHeader shop={shop} reportTitle="Cash & Bank Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect value={bucket} onValueChange={setBucket} options={BUCKET_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Cash & Bank Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`cash-bank-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/cash-bank?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No cash or bank movements found for this filter."
      />
    </div>
  );
}
