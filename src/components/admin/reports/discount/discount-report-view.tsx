"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import { formatCurrency } from "@/lib/utils/currency";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { DiscountReportRow, DiscountReportSummary } from "@/lib/services/reports/discount-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: DiscountReportSummary;
  rows: DiscountReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const DISCOUNT_TYPE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "FIXED", label: "Fixed" },
  { value: "COUPON", label: "Coupon" },
];

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: "Percentage",
  FIXED: "Fixed",
  Coupon: "Coupon",
  "-": "-",
};

const COLUMNS: ReportColumn<DiscountReportRow>[] = [
  { key: "billNumber", header: "Order No.", type: "text", value: (r) => r.billNumber, width: 1 },
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "customerName", header: "Customer", type: "text", value: (r) => r.customerName, width: 1.3 },
  { key: "originalAmount", header: "Original Amount", type: "currency", value: (r) => r.originalAmount, width: 1.1 },
  {
    key: "discountTypeLabel",
    header: "Discount Type",
    type: "text",
    value: (r) => r.discountTypeLabel,
    format: (r) => DISCOUNT_TYPE_LABELS[r.discountTypeLabel] ?? r.discountTypeLabel,
    width: 1,
  },
  {
    key: "discountValue",
    header: "Discount Value",
    type: "text",
    value: (r) => r.discountValue,
    format: (r) => {
      if (r.discountValue == null) return "-";
      return r.discountType === "PERCENTAGE" ? `${r.discountValue}%` : formatCurrency(r.discountValue);
    },
    width: 1,
  },
  { key: "discountAmount", header: "Discount Amount", type: "currency", value: (r) => r.discountAmount, width: 1.1 },
  { key: "finalAmount", header: "Final Amount", type: "currency", value: (r) => r.finalAmount, width: 1.1 },
];

export function DiscountReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [discountType, setDiscountType] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (discountType !== "ALL") params.set("discountType", discountType);
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
      .get<ReportApiResponse>(`/api/admin/reports/discount?${buildParams().toString()}`)
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
  }, [dateRange, search, discountType, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, discountType]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Discount", value: summary?.totalDiscount ?? 0, type: "currency" },
    { label: "Number of Discounted Orders", value: summary?.discountedOrderCount ?? 0, type: "number" },
    { label: "Average Discount", value: summary?.averageDiscount ?? 0, type: "currency" },
  ];

  const filterSummaryParts: string[] = [];
  if (discountType !== "ALL") filterSummaryParts.push(`Discount Type: ${DISCOUNT_TYPE_OPTIONS.find((o) => o.value === discountType)?.label ?? discountType}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Discount Report" description="Discounts given across orders and coupons." />
      <ReportPrintHeader shop={shop} reportTitle="Discount Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order no., customer, coupon code"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect value={discountType} onValueChange={setDiscountType} options={DISCOUNT_TYPE_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Discount Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`discount-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/discount?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No discounted orders found for this filter."
      />
    </div>
  );
}
