"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { PreparationReportRow, PreparationReportSummary } from "@/lib/services/reports/preparation-report";
import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/order-status";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: PreparationReportSummary;
  rows: PreparationReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const SOURCE_OPTIONS = [
  { value: "ALL", label: "All Sources" },
  { value: "Manual", label: "POS / Manual" },
  { value: "Online", label: "Online" },
];

const STATUS_OPTIONS = [{ value: "ALL", label: "All Statuses" }, ...ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))];

const COLUMNS: ReportColumn<PreparationReportRow>[] = [
  { key: "billNumber", header: "Order No.", type: "text", value: (r) => r.billNumber, width: 1 },
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "source", header: "Source", type: "text", value: (r) => r.source, width: 0.8 },
  { key: "status", header: "Status", type: "text", value: (r) => r.status, format: (r) => STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status, width: 0.9 },
  { key: "estimatedMinutes", header: "Estimated (min)", type: "number", value: (r) => r.estimatedMinutes, format: (r) => (r.estimatedMinutes != null ? String(r.estimatedMinutes) : "—"), width: 1 },
  { key: "actualMinutes", header: "Actual (min)", type: "number", value: (r) => r.actualMinutes, format: (r) => (r.actualMinutes != null ? String(r.actualMinutes) : "—"), width: 1 },
  { key: "delayMinutes", header: "Delay (min)", type: "number", value: (r) => r.delayMinutes, format: (r) => (r.delayMinutes != null ? String(r.delayMinutes) : "—"), width: 1 },
  { key: "preparedBy", header: "Prepared By", type: "text", value: (r) => r.preparedBy, format: (r) => r.preparedBy ?? "—", width: 1 },
];

export function PreparationReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (source !== "ALL") params.set("source", source);
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
      .get<ReportApiResponse>(`/api/admin/reports/preparation?${buildParams().toString()}`)
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
  }, [dateRange, search, source, status, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, source, status]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Orders Received", value: summary?.totalOrders ?? 0, type: "number" },
    {
      label: "Avg Estimated Prep Time",
      value: summary && summary.avgEstimatedMinutes != null ? `${summary.avgEstimatedMinutes}m` : "No data yet",
      type: "text",
      hint: summary ? `${summary.ordersWithEstimate} order(s) with an estimate` : undefined,
    },
    {
      label: "Avg Actual Prep Time",
      value: summary && summary.avgActualMinutes != null ? `${summary.avgActualMinutes}m` : "No data yet",
      type: "text",
      hint: "From accepted to marked ready",
    },
    { label: "Delayed Orders", value: summary?.delayedOrders ?? 0, type: "number" },
    {
      label: "Avg Delay Duration",
      value: summary && summary.avgDelayMinutes != null ? `${summary.avgDelayMinutes}m` : "No delays recorded",
      type: "text",
    },
  ];

  const filterSummaryParts: string[] = [];
  if (source !== "ALL") filterSummaryParts.push(`Source: ${SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source}`);
  if (status !== "ALL") filterSummaryParts.push(`Status: ${STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Order Preparation Report" description="Preparation-time estimates, delays and throughput across orders." />
      <ReportPrintHeader shop={shop} reportTitle="Order Preparation Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order no., customer"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect value={source} onValueChange={setSource} options={SOURCE_OPTIONS} />
        </div>
        <div className="w-44">
          <ReportSelect value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Order Preparation Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`preparation-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/preparation?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No orders found for this filter."
      />
    </div>
  );
}
