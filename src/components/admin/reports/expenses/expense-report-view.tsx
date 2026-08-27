"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from "@/lib/validation/expense";
import { PAYMENT_METHOD_LABELS } from "@/components/admin/expense-form";
import type { ExpenseReportRow, ExpenseReportSummary } from "@/lib/services/reports/expense-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface Party {
  id: string;
  name: string;
  phone: string;
  type: string;
}

interface ReportApiResponse {
  summary: ExpenseReportSummary;
  rows: ExpenseReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const COLUMNS: ReportColumn<ExpenseReportRow>[] = [
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "name", header: "Expense", type: "text", value: (r) => r.name, width: 1.6 },
  { key: "category", header: "Category", type: "text", value: (r) => r.category, width: 1.1 },
  { key: "partyName", header: "Vendor", type: "text", value: (r) => r.partyName, width: 1.2 },
  {
    key: "paymentMethod",
    header: "Payment Type",
    type: "text",
    value: (r) => r.paymentMethod,
    format: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod,
    width: 1,
  },
  { key: "transactionReference", header: "Reference", type: "text", value: (r) => r.transactionReference, width: 1, showInCard: false },
  { key: "amount", header: "Amount", type: "currency", value: (r) => r.amount, width: 1 },
];

export function ExpenseReportView({ shop, parties }: { shop: ReportPdfShopMeta; parties: Party[] }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [partyId, setPartyId] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (category !== "ALL") params.set("category", category);
    if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod);
    if (partyId !== "ALL") params.set("partyId", partyId);
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
      .get<ReportApiResponse>(`/api/admin/reports/expenses?${buildParams().toString()}`)
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
  }, [dateRange, search, category, paymentMethod, partyId, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, category, paymentMethod, partyId]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Expenses", value: summary?.totalExpenses ?? 0, type: "currency" },
    { label: "Number of Expenses", value: summary?.expenseCount ?? 0, type: "number" },
    { label: "This Month", value: summary?.thisMonthTotal ?? 0, type: "currency" },
    { label: "Average per Expense", value: summary?.averageExpense ?? 0, type: "currency" },
  ];

  const filterSummaryParts: string[] = [];
  if (category !== "ALL") filterSummaryParts.push(`Category: ${category}`);
  if (paymentMethod !== "ALL") filterSummaryParts.push(`Payment: ${PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod}`);
  if (partyId !== "ALL") filterSummaryParts.push(`Vendor: ${parties.find((p) => p.id === partyId)?.name ?? partyId}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Expense Report" description="Business expenses by category, vendor and payment type." />
      <ReportPrintHeader shop={shop} reportTitle="Expense Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search expense name, notes, reference"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect
            value={category}
            onValueChange={setCategory}
            options={[{ value: "ALL", label: "All Categories" }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <div className="w-40">
          <ReportSelect
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            options={[
              { value: "ALL", label: "All Payments" },
              ...EXPENSE_PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })),
            ]}
          />
        </div>
        <div className="w-40">
          <ReportSelect
            value={partyId}
            onValueChange={setPartyId}
            options={[{ value: "ALL", label: "All Vendors" }, ...parties.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Expense Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`expense-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/expenses?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No expenses found for this filter."
      />
    </div>
  );
}
