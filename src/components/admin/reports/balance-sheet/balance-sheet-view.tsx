"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import { formatCurrency } from "@/lib/utils/currency";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type { BalanceSheetData, BalanceSheetLineItem } from "@/lib/services/reports/balance-sheet-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportDateRangePicker, type ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";

interface ExportRow {
  section: string;
  label: string;
  value: number | null;
}

const COLUMNS: ReportColumn<ExportRow>[] = [
  { key: "section", header: "Section", type: "text", value: (r) => r.section, width: 0.7 },
  { key: "label", header: "Item", type: "text", value: (r) => r.label, width: 2 },
  { key: "value", header: "Amount", type: "currency", value: (r) => r.value, align: "right", width: 1 },
];

function toExportRows(items: BalanceSheetLineItem[]): ExportRow[] {
  return items.map((item) => ({
    section: item.section,
    // Bake the "why" into the label itself for null (unconfigured) rows so
    // PDF/Excel/CSV exports stay self-explanatory without needing per-row
    // conditional currency formatting (which would reopen the rupee-glyph
    // PDF bug the currency-safe formatter exists to avoid).
    label: item.value == null && item.hint ? `${item.label} — ${item.hint}` : item.label,
    value: item.value,
  }));
}

function LineRow({ item }: { item: BalanceSheetLineItem }) {
  const isTotal = item.label.startsWith("Total") || item.label.startsWith("Implied");
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 text-sm ${isTotal ? "border-t pt-2 font-semibold" : ""}`}>
      <div>
        <span>{item.label}</span>
        {item.hint && <p className="text-xs font-normal text-muted-foreground">{item.hint}</p>}
      </div>
      <span className="shrink-0 tabular-nums">{item.value == null ? "Not configured" : formatCurrency(item.value)}</span>
    </div>
  );
}

export function BalanceSheetView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("today");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "today", ...initialRange });
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<BalanceSheetData>(`/api/admin/reports/balance-sheet?to=${dateRange.to}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Assets", value: data?.totalAssets ?? 0, type: "currency" },
    { label: "Total Liabilities", value: data?.totalLiabilities ?? 0, type: "currency" },
    {
      label: "Implied Equity",
      value: data?.impliedEquity ?? 0,
      type: "currency",
      hint: "Assets minus Liabilities — not validated against owner capital records",
    },
    {
      label: "Inventory Value",
      value: data?.inventoryValue ?? 0,
      type: "currency",
      hint: data && data.inventoryExcludedCount > 0 ? `${data.inventoryExcludedCount} product(s) excluded — missing stock or cost price` : undefined,
    },
  ];

  const asOfLabel = data ? `As of ${data.asOfLabel}` : "";
  const assetItems = data?.lineItems.filter((i) => i.section === "Assets") ?? [];
  const liabilityItems = data?.lineItems.filter((i) => i.section === "Liabilities") ?? [];
  const equityItems = data?.lineItems.filter((i) => i.section === "Equity") ?? [];

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Balance Sheet" description="Assets, liabilities and equity at a glance." />
      <ReportPrintHeader shop={shop} reportTitle="Balance Sheet" dateRangeLabel={asOfLabel} />

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <ReportDateRangePicker value={dateRange} onChange={setDateRange} />
        <span className="text-sm text-muted-foreground">
          A balance sheet is a snapshot as of a single date — pick a "to" date above; the "from" side of the picker is unused here.
        </span>
      </div>

      <ReportExportButtons
        reportTitle="Balance Sheet"
        dateRangeLabel={asOfLabel}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`balance-sheet_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<BalanceSheetData>(`/api/admin/reports/balance-sheet?to=${dateRange.to}`);
          return { rows: toExportRows(res.lineItems), total: res.lineItems.length, truncated: false };
        }}
      />

      <ReportSummaryCards items={summaryCards} />

      {loading || !data ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1 rounded-lg p-4 ring-1 ring-foreground/10">
            <h2 className="pb-2 font-heading text-sm font-semibold">Assets</h2>
            {assetItems.map((item) => (
              <LineRow key={item.label} item={item} />
            ))}
          </div>
          <div className="space-y-4">
            <div className="space-y-1 rounded-lg p-4 ring-1 ring-foreground/10">
              <h2 className="pb-2 font-heading text-sm font-semibold">Liabilities</h2>
              {liabilityItems.map((item) => (
                <LineRow key={item.label} item={item} />
              ))}
            </div>
            <div className="space-y-1 rounded-lg p-4 ring-1 ring-foreground/10">
              <h2 className="pb-2 font-heading text-sm font-semibold">Equity</h2>
              {equityItems.map((item) => (
                <LineRow key={item.label} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
