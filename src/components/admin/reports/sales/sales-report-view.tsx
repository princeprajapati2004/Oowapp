"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import { PAYMENT_LABELS, PAYMENT_STATUSES, STATUS_LABELS, ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/order-status";
import type { SalesReportRow, SalesReportSummary } from "@/lib/services/reports/sales-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: SalesReportSummary;
  rows: SalesReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const COLUMNS: ReportColumn<SalesReportRow>[] = [
  { key: "billNumber", header: "Bill No.", type: "text", value: (r) => r.billNumber, width: 1 },
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "customerName", header: "Customer", type: "text", value: (r) => r.customerName, width: 1.3 },
  { key: "orderType", header: "Order Type", type: "text", value: (r) => r.orderType, width: 0.8 },
  { key: "itemCount", header: "Items", type: "number", value: (r) => r.itemCount, width: 0.6 },
  { key: "subtotal", header: "Subtotal", type: "currency", value: (r) => r.subtotal, width: 1 },
  { key: "discount", header: "Discount", type: "currency", value: (r) => r.discount, width: 1 },
  { key: "tax", header: "Tax", type: "currency", value: (r) => r.tax, width: 1 },
  { key: "total", header: "Total", type: "currency", value: (r) => r.total, width: 1 },
  { key: "paid", header: "Paid", type: "currency", value: (r) => r.paid, width: 1 },
  { key: "pending", header: "Pending", type: "currency", value: (r) => r.pending, width: 1 },
  {
    key: "paymentStatus",
    header: "Payment Status",
    type: "text",
    value: (r) => r.paymentStatus,
    format: (r) => PAYMENT_LABELS[r.paymentStatus],
    width: 1,
  },
];

export function SalesReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [orderStatus, setOrderStatus] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (paymentStatus !== "ALL") params.set("paymentStatus", paymentStatus);
    if (orderStatus !== "ALL") params.set("orderStatus", orderStatus);
    if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod);
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
      .get<ReportApiResponse>(`/api/admin/reports/sales?${buildParams().toString()}`)
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
  }, [dateRange, search, paymentStatus, orderStatus, paymentMethod, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, paymentStatus, orderStatus, paymentMethod]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Sales", value: summary?.totalSales ?? 0, type: "currency" },
    { label: "Number of Orders", value: summary?.orderCount ?? 0, type: "number" },
    { label: "Paid Amount", value: summary?.paidAmount ?? 0, type: "currency" },
    { label: "Pending Amount", value: summary?.pendingAmount ?? 0, type: "currency" },
    { label: "Discount", value: summary?.discount ?? 0, type: "currency" },
    { label: "Tax", value: summary?.tax ?? 0, type: "currency" },
    { label: "Total Refunds", value: summary?.totalRefunds ?? 0, type: "currency" },
    {
      label: "Net Sales",
      value: summary?.netSales ?? 0,
      type: "currency",
      hint: "Total Sales minus processed refunds",
    },
  ];

  const filterSummaryParts: string[] = [];
  if (paymentStatus !== "ALL") filterSummaryParts.push(`Payment Status: ${PAYMENT_LABELS[paymentStatus as keyof typeof PAYMENT_LABELS]}`);
  if (orderStatus !== "ALL") filterSummaryParts.push(`Order Status: ${STATUS_LABELS[orderStatus as keyof typeof STATUS_LABELS]}`);
  if (paymentMethod !== "ALL")
    filterSummaryParts.push(`Payment Method: ${PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label ?? paymentMethod}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Sales Report" description="View sales, orders, taxes, discounts and net revenue." />
      <ReportPrintHeader shop={shop} reportTitle="Sales Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bill no., customer name or phone"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-44">
          <ReportSelect
            value={paymentStatus}
            onValueChange={setPaymentStatus}
            options={[{ value: "ALL", label: "All Payment Status" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_LABELS[s] }))]}
          />
        </div>
        <div className="w-44">
          <ReportSelect
            value={orderStatus}
            onValueChange={setOrderStatus}
            options={[{ value: "ALL", label: "All Order Status" }, ...ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
          />
        </div>
        <div className="w-44">
          <ReportSelect
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            options={[{ value: "ALL", label: "All Payment Methods" }, ...PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))]}
          />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Sales Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`sales-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/sales?${buildParams({ all: true }).toString()}`);
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
