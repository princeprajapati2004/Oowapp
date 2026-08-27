"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { ProfitReportRow, ProfitReportSummary } from "@/lib/services/reports/profit-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: ProfitReportSummary;
  rows: ProfitReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const COLUMNS: ReportColumn<ProfitReportRow>[] = [
  { key: "billNumber", header: "Order No.", type: "text", value: (r) => r.billNumber, width: 1 },
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "customerName", header: "Customer", type: "text", value: (r) => r.customerName, width: 1.3 },
  { key: "salesValue", header: "Sales Value", type: "currency", value: (r) => r.salesValue, width: 1 },
  { key: "purchaseCost", header: "Purchase Cost", type: "currency", value: (r) => r.purchaseCost, width: 1 },
  { key: "discount", header: "Discount", type: "currency", value: (r) => r.discount, width: 1, showInCard: false },
  { key: "grossProfit", header: "Gross Profit", type: "currency", value: (r) => r.grossProfit, width: 1 },
  {
    key: "profitPercent",
    header: "Profit %",
    type: "text",
    value: (r) => r.profitPercent,
    format: (r) => (r.profitPercent != null ? `${r.profitPercent.toFixed(1)}%` : "-"),
    width: 0.8,
  },
  {
    key: "dataFlag",
    header: "Data",
    type: "text",
    value: (r) => (r.hasIncompleteCostData ? "Partial" : ""),
    width: 0.7,
    showInCard: false,
  },
];

const COST_DATA_OPTIONS = [
  { value: "ALL", label: "All Orders" },
  { value: "COMPLETE", label: "Complete Data Only" },
];

export function ProfitReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [costDataFilter, setCostDataFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (costDataFilter === "COMPLETE") params.set("completeOnly", "true");
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
      .get<ReportApiResponse>(`/api/admin/reports/profit?${buildParams().toString()}`)
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
  }, [dateRange, search, costDataFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, costDataFilter]);

  const summary = data?.summary;
  const incompleteHint =
    summary && summary.incompleteCostDataCount > 0
      ? `${summary.incompleteCostDataCount} order${summary.incompleteCostDataCount === 1 ? "" : "s"} had incomplete cost data`
      : undefined;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Sales", value: summary?.totalSales ?? 0, type: "currency" },
    { label: "Total Cost", value: summary?.totalCost ?? 0, type: "currency", hint: incompleteHint },
    { label: "Gross Profit", value: summary?.grossProfit ?? 0, type: "currency", hint: incompleteHint },
    { label: "Discount", value: summary?.totalDiscount ?? 0, type: "currency" },
    {
      label: "Net Profit (after refunds)",
      value: summary?.netProfitAfterRefunds ?? 0,
      type: "currency",
      hint: summary && summary.totalRefunds > 0 ? `Refunds deducted: ₹${summary.totalRefunds.toLocaleString("en-IN")}` : incompleteHint,
    },
  ];

  const filterSummaryParts: string[] = [];
  if (costDataFilter === "COMPLETE") filterSummaryParts.push("Complete Cost Data Only");
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Profit on Selling Report" description="Gross and net profit for every order, from actual item cost data." />
      <ReportPrintHeader shop={shop} reportTitle="Profit on Selling Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order number or customer"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-44">
          <ReportSelect value={costDataFilter} onValueChange={setCostDataFilter} options={COST_DATA_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Profit on Selling Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`profit-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/profit?${buildParams({ all: true }).toString()}`);
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
