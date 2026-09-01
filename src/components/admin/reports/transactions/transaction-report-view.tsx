"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/order-status";
import type { TransactionReportRow, TransactionReportSummary } from "@/lib/services/reports/transaction-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: TransactionReportSummary;
  rows: TransactionReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const SOURCE_OPTIONS = [
  { value: "ALL", label: "All Sources" },
  { value: "ORDER_PAYMENT", label: "Sale Payments" },
  { value: "PARTY_PAYMENT", label: "Party Payments" },
];

const COLUMNS: ReportColumn<TransactionReportRow>[] = [
  { key: "id", header: "Transaction ID", type: "text", value: (r) => r.id, width: 1.4, showInCard: false },
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "reference", header: "Reference / Customer-Supplier", type: "text", value: (r) => r.reference, width: 1.6 },
  { key: "type", header: "Type", type: "text", value: (r) => r.type, width: 1 },
  {
    key: "method",
    header: "Payment Method",
    type: "text",
    value: (r) => r.method,
    format: (r) => paymentMethodLabel(r.method),
    width: 1,
  },
  { key: "amount", header: "Amount", type: "currency", value: (r) => r.amount, width: 1 },
  { key: "notes", header: "Notes", type: "text", value: (r) => r.notes, width: 1.3, showInCard: false },
];

export function TransactionReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod);
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
      .get<ReportApiResponse>(`/api/admin/reports/transactions?${buildParams().toString()}`)
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
  }, [dateRange, search, paymentMethod, source, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, paymentMethod, source]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Transactions", value: summary?.totalTransactions ?? 0, type: "number" },
    { label: "Total Amount", value: summary?.totalAmount ?? 0, type: "currency" },
    { label: "Cash Transactions", value: summary?.cashAmount ?? 0, type: "currency", hint: summary ? `${summary.cashCount} transactions` : undefined },
    { label: "Digital / Other Transactions", value: summary?.otherAmount ?? 0, type: "currency", hint: summary ? `${summary.otherCount} transactions` : undefined },
  ];

  const filterSummaryParts: string[] = [];
  if (paymentMethod !== "ALL") filterSummaryParts.push(`Payment: ${paymentMethodLabel(paymentMethod)}`);
  if (source !== "ALL") filterSummaryParts.push(`Source: ${SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Transaction Report" description="All payments across cash, UPI, card and bank transfer." />
      <ReportPrintHeader shop={shop} reportTitle="Transaction Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference, notes, customer or party"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            options={[{ value: "ALL", label: "All Payments" }, ...PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))]}
          />
        </div>
        <div className="w-40">
          <ReportSelect value={source} onValueChange={setSource} options={SOURCE_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Transaction Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`transaction-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/transactions?${buildParams({ all: true }).toString()}`);
          return { rows: res.rows, total: res.total, truncated: res.truncated };
        }}
      />

      <ReportSummaryCards items={summaryCards} />

      <ReportDataTable
        columns={COLUMNS}
        rows={data?.rows ?? []}
        rowKey={(r) => `${r.source}:${r.id}`}
        page={data?.page ?? page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
        isLoading={loading}
        emptyMessage="No transactions found for this filter."
      />
    </div>
  );
}
