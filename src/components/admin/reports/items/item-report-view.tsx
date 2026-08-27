"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { ItemReportRow, ItemReportSummary } from "@/lib/services/reports/item-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface Category {
  id: string;
  name: string;
}

interface ReportApiResponse {
  summary: ItemReportSummary;
  rows: ItemReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const COLUMNS: ReportColumn<ItemReportRow>[] = [
  { key: "name", header: "Product", type: "text", value: (r) => r.name, width: 1.6 },
  { key: "barcode", header: "SKU/Barcode", type: "text", value: (r) => r.barcode, width: 1, showInCard: false },
  { key: "categoryName", header: "Category", type: "text", value: (r) => r.categoryName, width: 1 },
  { key: "costPrice", header: "Purchase Price", type: "currency", value: (r) => r.costPrice, width: 1 },
  { key: "price", header: "Selling Price", type: "currency", value: (r) => r.price, width: 1 },
  { key: "mrp", header: "MRP", type: "currency", value: (r) => r.mrp, width: 1, showInCard: false },
  { key: "stock", header: "Current Stock", type: "number", value: (r) => r.stock, width: 0.9 },
  { key: "unitsSold", header: "Units Sold", type: "number", value: (r) => r.unitsSold, width: 0.9 },
  { key: "unitsPurchased", header: "Units Purchased", type: "number", value: (r) => r.unitsPurchased, width: 0.9, showInCard: false },
  { key: "salesAmount", header: "Sales Amount", type: "currency", value: (r) => r.salesAmount, width: 1.1 },
  // profit stays null (not 0) when costPrice is unknown — formatColumnValue
  // already renders null as "-" with no extra format() needed.
  { key: "profit", header: "Profit", type: "currency", value: (r) => r.profit, width: 1 },
];

export function ItemReportView({ shop, categories }: { shop: ReportPdfShopMeta; categories: Category[] }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (categoryId !== "ALL") params.set("categoryId", categoryId);
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
      .get<ReportApiResponse>(`/api/admin/reports/items?${buildParams().toString()}`)
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
  }, [dateRange, search, categoryId, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, categoryId]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Products", value: summary?.totalProducts ?? 0, type: "number" },
    { label: "Total Units Sold", value: summary?.totalUnitsSold ?? 0, type: "number" },
    { label: "Total Sales Amount", value: summary?.totalSalesAmount ?? 0, type: "currency" },
    {
      label: "Total Profit",
      value: summary?.totalProfit ?? 0,
      type: "currency",
      hint:
        summary && summary.excludedFromProfitCount > 0
          ? `${summary.excludedFromProfitCount} product${summary.excludedFromProfitCount === 1 ? "" : "s"} excluded — no cost price set`
          : undefined,
    },
  ];

  const filterSummaryParts: string[] = [];
  if (categoryId !== "ALL") filterSummaryParts.push(`Category: ${categories.find((c) => c.id === categoryId)?.name ?? categoryId}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Item Report" description="Per-product sales, purchases, stock and profit." />
      <ReportPrintHeader shop={shop} reportTitle="Item Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search product name or barcode"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-44">
          <ReportSelect
            value={categoryId}
            onValueChange={setCategoryId}
            options={[{ value: "ALL", label: "All Categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Item Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`item-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/items?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No products found for this filter."
      />
    </div>
  );
}
