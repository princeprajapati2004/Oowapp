"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type {
  CashbackReportRow,
  CashbackReportStatus,
  CashbackReportSummary,
} from "@/lib/services/reports/cashback-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: CashbackReportSummary;
  rows: CashbackReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

// VOIDED is the real CashbackRedemptionStatus enum value (schema.prisma) —
// only the display label reads "Cancelled", nothing invented.
const STATUS_LABELS: Record<CashbackReportStatus, string> = {
  PENDING: "Pending",
  CREDITED: "Credited",
  VOIDED: "Cancelled",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "CREDITED", label: "Credited" },
  { value: "VOIDED", label: "Cancelled" },
];

const COLUMNS: ReportColumn<CashbackReportRow>[] = [
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "campaignCode", header: "Campaign Code", type: "text", value: (r) => r.campaignCode, width: 1.1 },
  {
    key: "customer",
    header: "Customer",
    type: "text",
    value: (r) => r.customerName,
    format: (r) => [r.customerName, r.customerPhone].filter(Boolean).join(" · ") || "-",
    width: 1.4,
  },
  {
    key: "order",
    header: "Order",
    type: "text",
    value: (r) => r.billNumber,
    format: (r) => `#${r.billNumber}`,
    width: 1,
  },
  { key: "orderAmount", header: "Order Amount", type: "currency", value: (r) => r.orderAmount, width: 1 },
  { key: "cashbackAmount", header: "Cashback Amount", type: "currency", value: (r) => r.cashbackAmount, width: 1 },
  {
    key: "status",
    header: "Status",
    type: "text",
    value: (r) => r.status,
    format: (r) => STATUS_LABELS[r.status],
    width: 0.8,
  },
];

export function CashbackReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (status !== "ALL") params.set("status", status);
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
      .get<ReportApiResponse>(`/api/admin/reports/cashback?${buildParams().toString()}`)
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
  }, [dateRange, search, status, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, status]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Cashback Generated", value: summary?.totalGenerated ?? 0, type: "currency" },
    { label: "Total Cashback Credited", value: summary?.totalCredited ?? 0, type: "currency" },
    { label: "Pending Cashback", value: summary?.totalPending ?? 0, type: "currency" },
    { label: "Cancelled / Voided", value: summary?.totalVoided ?? 0, type: "currency" },
  ];

  const filterSummaryParts: string[] = [];
  if (status !== "ALL") filterSummaryParts.push(`Status: ${STATUS_LABELS[status as CashbackReportStatus]}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Cashback Report" description="Cashback generated, credited and cancelled by campaign." />
      <ReportPrintHeader shop={shop} reportTitle="Cashback Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search campaign code, customer name or phone"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Cashback Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`cashback-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/cashback?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No cashback redemptions found for this filter."
      />
    </div>
  );
}
