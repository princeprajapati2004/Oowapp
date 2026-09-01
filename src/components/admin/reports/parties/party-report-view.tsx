"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { PartyReportRow, PartyReportSummary } from "@/lib/services/reports/party-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: PartyReportSummary;
  rows: PartyReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const TYPE_OPTIONS = [
  { value: "ALL", label: "All Parties" },
  { value: "CUSTOMER", label: "Customers" },
  { value: "SUPPLIER", label: "Suppliers" },
];

const COLUMNS: ReportColumn<PartyReportRow>[] = [
  { key: "name", header: "Party Name", type: "text", value: (r) => r.name, width: 1.6 },
  {
    key: "type",
    header: "Type",
    type: "text",
    value: (r) => r.type,
    format: (r) => (r.type === "CUSTOMER" ? "Customer" : "Supplier"),
    width: 0.8,
  },
  { key: "totalOrders", header: "Total Orders", type: "number", value: (r) => r.totalOrders, width: 0.9 },
  { key: "totalSalesOrPurchases", header: "Total Sales/Purchases", type: "currency", value: (r) => r.totalSalesOrPurchases, width: 1.2 },
  { key: "paidInRange", header: "Paid", type: "currency", value: (r) => r.paidInRange, width: 1 },
  { key: "receivedInRange", header: "Received", type: "currency", value: (r) => r.receivedInRange, width: 1 },
  // "As of Today" in the header itself — this figure is always all-time,
  // never date-range-scoped, unlike every other column in this table (see
  // computeOutstanding in party.ts). Never blur that distinction.
  { key: "outstanding", header: "Outstanding (As of Today)", type: "currency", value: (r) => r.outstanding, width: 1.3 },
];

export function PartyReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (type !== "ALL") params.set("type", type);
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
      .get<ReportApiResponse>(`/api/admin/reports/parties?${buildParams().toString()}`)
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
  }, [dateRange, search, type, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, type]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Parties", value: summary?.totalParties ?? 0, type: "number" },
    { label: "Total Outstanding", value: summary?.totalOutstanding ?? 0, type: "currency", hint: "As of today, not date-range scoped" },
    { label: "Total Received", value: summary?.totalReceivedInRange ?? 0, type: "currency" },
    { label: "Total Paid Out", value: summary?.totalPaidOutInRange ?? 0, type: "currency" },
  ];

  const filterSummaryParts: string[] = [];
  if (type !== "ALL") filterSummaryParts.push(`Type: ${TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Party Report" description="Customer and supplier activity, payments and outstanding balances." />
      <ReportPrintHeader shop={shop} reportTitle="Party Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search party name or phone"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect value={type} onValueChange={setType} options={TYPE_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Party Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`party-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/parties?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No parties found for this filter."
      />

      {/* Statement drill-down — report-data-table.tsx renders plain text
          cells only (no per-row links), so the "View Statement" link the
          spec calls for lives here instead, correlated 1:1 with the current
          page of rows above, pointing at the existing party ledger page
          (src/app/admin/(dashboard)/parties/[id]/page.tsx). */}
      {data && data.rows.length > 0 && (
        <div className="space-y-2 print:hidden">
          <p className="text-xs font-medium text-muted-foreground">View full statement</p>
          <div className="flex flex-wrap gap-2">
            {data.rows.map((row) => (
              <Link
                key={row.id}
                href={`/admin/parties/${row.id}`}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ring-1 ring-foreground/10 hover:bg-muted"
              >
                {row.name}
                <ArrowUpRight className="size-3" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
