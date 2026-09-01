"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { StockReportRow, StockReportSummary } from "@/lib/services/reports/stock-report";
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
  summary: StockReportSummary;
  rows: StockReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const COLUMNS: ReportColumn<StockReportRow>[] = [
  { key: "name", header: "Product", type: "text", value: (r) => r.name, width: 1.6 },
  { key: "barcode", header: "SKU/Barcode", type: "text", value: (r) => r.barcode, width: 1, showInCard: false },
  { key: "hsnCode", header: "HSN Code", type: "text", value: (r) => r.hsnCode, width: 0.8, showInCard: false },
  { key: "openingStock", header: "Opening Stock*", type: "number", value: (r) => r.openingStock, width: 1 },
  { key: "purchasedInRange", header: "Purchased", type: "number", value: (r) => r.purchasedInRange, width: 0.9, showInCard: false },
  { key: "soldInRange", header: "Sold", type: "number", value: (r) => r.soldInRange, width: 0.9 },
  { key: "returnedInRange", header: "Returned", type: "number", value: (r) => r.returnedInRange, width: 0.9, showInCard: false },
  { key: "lossDamageInRange", header: "Lost/Damaged", type: "number", value: (r) => r.lossDamageInRange, width: 0.9, showInCard: false },
  { key: "currentStock", header: "Current Stock", type: "number", value: (r) => r.currentStock, width: 0.9 },
  { key: "costPrice", header: "Purchase Price", type: "currency", value: (r) => r.costPrice, width: 1, showInCard: false },
  { key: "price", header: "Selling Price", type: "currency", value: (r) => r.price, width: 1, showInCard: false },
  { key: "stockValue", header: "Stock Value", type: "currency", value: (r) => r.stockValue, width: 1 },
];

const STOCK_FILTER_OPTIONS = [
  { value: "ALL", label: "All Stock" },
  { value: "LOW_STOCK", label: "Low Stock Only" },
];

export function StockReportView({ shop, categories }: { shop: ReportPdfShopMeta; categories: Category[] }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
    if (categoryId !== "ALL") params.set("categoryId", categoryId);
    if (stockFilter === "LOW_STOCK") params.set("lowStockOnly", "true");
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
      .get<ReportApiResponse>(`/api/admin/reports/stock?${buildParams().toString()}`)
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
  }, [dateRange, search, categoryId, stockFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, categoryId, stockFilter]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Products", value: summary?.totalProducts ?? 0, type: "number" },
    {
      label: "Total Current Stock Value",
      value: summary?.totalStockValue ?? 0,
      type: "currency",
      hint:
        summary && summary.stockValueExcludedCount > 0
          ? `${summary.stockValueExcludedCount} product${summary.stockValueExcludedCount === 1 ? "" : "s"} excluded — missing cost price or stock not tracked`
          : undefined,
    },
    {
      label: "Low Stock Count",
      value: summary?.lowStockCount ?? 0,
      type: "number",
      hint: `Stock at or below ${summary?.lowStockThreshold ?? 10} units`,
    },
    { label: "Out of Stock Count", value: summary?.outOfStockCount ?? 0, type: "number" },
  ];

  const filterSummaryParts: string[] = [];
  if (categoryId !== "ALL") filterSummaryParts.push(`Category: ${categories.find((c) => c.id === categoryId)?.name ?? categoryId}`);
  if (stockFilter === "LOW_STOCK") filterSummaryParts.push("Low Stock Only");
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Stock Report" description="Opening, purchased, sold and current stock per product." />
      <ReportPrintHeader shop={shop} reportTitle="Stock Report" dateRangeLabel={dateRangeLabel} />

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
        <div className="w-40">
          <ReportSelect value={stockFilter} onValueChange={setStockFilter} options={STOCK_FILTER_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Stock Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`stock-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/stock?${buildParams({ all: true }).toString()}`);
          return { rows: res.rows, total: res.total, truncated: res.truncated };
        }}
      />

      <ReportSummaryCards items={summaryCards} />

      <p className="text-xs text-muted-foreground print:hidden">
        * Opening Stock is derived from stock movements and may not reflect manual stock edits made during this period.
      </p>

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
