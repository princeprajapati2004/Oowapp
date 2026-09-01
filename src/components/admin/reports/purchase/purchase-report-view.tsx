"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import { PAYMENT_LABELS } from "@/lib/order-status";
import type { PurchaseReportRow, PurchaseReportSummary } from "@/lib/services/reports/purchase-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface Supplier {
  id: string;
  name: string;
  phone: string;
  gstNumber: string | null;
}

interface ReportApiResponse {
  summary: PurchaseReportSummary;
  rows: PurchaseReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

// Purchases only ever reach PENDING/PARTIALLY_PAID/PAID (see
// recomputePaymentStatus in order-payment-status.ts, which never assigns
// REFUNDED to a Purchase) — the filter deliberately excludes REFUNDED rather
// than offering a status a purchase can never have.
const PURCHASE_PAYMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID"] as const;

const PURCHASE_STATUSES: { value: string; label: string }[] = [
  { value: "RECORDED", label: "Recorded" },
  { value: "CANCELLED", label: "Cancelled" },
];

const COLUMNS: ReportColumn<PurchaseReportRow>[] = [
  { key: "purchaseNumber", header: "Purchase No.", type: "text", value: (r) => r.purchaseNumber, width: 1 },
  { key: "date", header: "Date", type: "date", value: (r) => r.date, width: 1 },
  { key: "supplierName", header: "Supplier", type: "text", value: (r) => r.supplierName, width: 1.3 },
  { key: "itemCount", header: "Items", type: "number", value: (r) => r.itemCount, width: 0.6 },
  { key: "quantity", header: "Quantity", type: "number", value: (r) => r.quantity, width: 0.7 },
  { key: "total", header: "Total", type: "currency", value: (r) => r.total, width: 1 },
  { key: "paid", header: "Paid", type: "currency", value: (r) => r.paid, width: 1 },
  { key: "pending", header: "Pending", type: "currency", value: (r) => r.pending, width: 1 },
  {
    key: "status",
    header: "Status",
    type: "text",
    value: (r) => r.status,
    format: (r) => (r.status === "CANCELLED" ? "Cancelled" : PAYMENT_LABELS[r.paymentStatus]),
    width: 1,
  },
];

export function PurchaseReportView({ shop, suppliers }: { shop: ReportPdfShopMeta; suppliers: Supplier[] }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("ALL");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (supplierId !== "ALL") params.set("supplierId", supplierId);
    if (paymentStatus !== "ALL") params.set("paymentStatus", paymentStatus);
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
      .get<ReportApiResponse>(`/api/admin/reports/purchase?${buildParams().toString()}`)
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
  }, [dateRange, search, supplierId, paymentStatus, status, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, supplierId, paymentStatus, status]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Purchase Amount", value: summary?.totalPurchaseAmount ?? 0, type: "currency" },
    { label: "Number of Purchase Bills", value: summary?.purchaseCount ?? 0, type: "number" },
    { label: "Paid", value: summary?.paid ?? 0, type: "currency" },
    { label: "Pending", value: summary?.pending ?? 0, type: "currency" },
  ];

  const filterSummaryParts: string[] = [];
  if (supplierId !== "ALL") filterSummaryParts.push(`Supplier: ${suppliers.find((s) => s.id === supplierId)?.name ?? supplierId}`);
  if (paymentStatus !== "ALL") filterSummaryParts.push(`Payment Status: ${PAYMENT_LABELS[paymentStatus as keyof typeof PAYMENT_LABELS]}`);
  if (status !== "ALL") filterSummaryParts.push(`Status: ${PURCHASE_STATUSES.find((s) => s.value === status)?.label ?? status}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Purchase Report" description="Track supplier purchases, quantities and payment status." />
      <ReportPrintHeader shop={shop} reportTitle="Purchase Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search purchase no., supplier or invoice no."
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-44">
          <ReportSelect
            value={supplierId}
            onValueChange={setSupplierId}
            options={[{ value: "ALL", label: "All Suppliers" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </div>
        <div className="w-44">
          <ReportSelect
            value={paymentStatus}
            onValueChange={setPaymentStatus}
            options={[
              { value: "ALL", label: "All Payment Status" },
              ...PURCHASE_PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_LABELS[s] })),
            ]}
          />
        </div>
        <div className="w-40">
          <ReportSelect value={status} onValueChange={setStatus} options={[{ value: "ALL", label: "All Status" }, ...PURCHASE_STATUSES]} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Purchase Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`purchase-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/purchase?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No purchases found for this filter."
      />
    </div>
  );
}
