"use client";

import { useEffect, useState } from "react";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api } from "@/lib/api-client";
import { presetToDateStrings } from "@/lib/utils/date-range";
import type { ReportColumn, ReportSummaryItem } from "@/lib/utils/report-columns";
import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";
import type {
  ReferralReportRow,
  ReferralReportStatus,
  ReferralReportSummary,
} from "@/lib/services/reports/referral-report";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportPrintHeader } from "@/components/admin/reports/report-print-header";
import { ReportFilterBar } from "@/components/admin/reports/report-filter-bar";
import { ReportSummaryCards } from "@/components/admin/reports/report-summary-cards";
import { ReportDataTable } from "@/components/admin/reports/report-data-table";
import { ReportExportButtons } from "@/components/admin/reports/report-export-buttons";
import type { ReportDateRangeValue } from "@/components/admin/reports/date-range-picker";

interface ReportApiResponse {
  summary: ReferralReportSummary;
  rows: ReferralReportRow[];
  total: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  range: { from: string; to: string; label: string };
}

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<ReferralReportStatus, string> = {
  PENDING: "Pending",
  REWARDED: "Rewarded",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "REWARDED", label: "Rewarded" },
];

const COLUMNS: ReportColumn<ReferralReportRow>[] = [
  { key: "date", header: "Referral Date", type: "date", value: (r) => r.date, width: 1 },
  {
    key: "referrer",
    header: "Referrer",
    type: "text",
    value: (r) => r.referrerName,
    format: (r) => [r.referrerName, r.referrerPhone].filter(Boolean).join(" · ") || "-",
    width: 1.4,
  },
  {
    key: "referred",
    header: "Referred Customer",
    type: "text",
    value: (r) => r.referredName,
    format: (r) => [r.referredName, r.referredPhone].filter(Boolean).join(" · ") || "-",
    width: 1.4,
  },
  {
    key: "qualifyingOrder",
    header: "Qualifying Order",
    type: "text",
    value: (r) => r.qualifyingBillNumber,
    format: (r) => (r.qualifyingBillNumber ? `#${r.qualifyingBillNumber}` : "-"),
    width: 1,
  },
  { key: "orderAmount", header: "Order Amount", type: "currency", value: (r) => r.orderAmount, width: 1 },
  { key: "rewardAmount", header: "Reward Amount", type: "currency", value: (r) => r.rewardAmount, width: 1 },
  {
    key: "status",
    header: "Status",
    type: "text",
    value: (r) => r.status,
    format: (r) => STATUS_LABELS[r.status],
    width: 0.8,
    showInCard: true,
  },
  {
    key: "walletCredit",
    header: "Wallet Credit",
    type: "text",
    value: (r) => (r.walletCredited ? "Credited" : "-"),
    width: 0.8,
  },
];

export function ReferralReportView({ shop }: { shop: ReportPdfShopMeta }) {
  const initialRange = presetToDateStrings("this_month");
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>({ preset: "this_month", ...initialRange });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function buildParams(overrides?: { all?: boolean }) {
    const params = new URLSearchParams();
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
    if (search) params.set("search", search);
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
      .get<ReportApiResponse>(`/api/admin/reports/referrals?${buildParams().toString()}`)
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
  }, [dateRange, search, status, page]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, search, status]);

  const summary = data?.summary;
  const summaryCards: ReportSummaryItem[] = [
    { label: "Total Referrals", value: summary?.totalReferrals ?? 0, type: "number" },
    { label: "Successful Referrals", value: summary?.rewardedReferrals ?? 0, type: "number" },
    { label: "Pending Referrals", value: summary?.pendingReferrals ?? 0, type: "number" },
    { label: "Total Rewards Paid", value: summary?.totalRewardsPaid ?? 0, type: "currency" },
  ];

  const filterSummaryParts: string[] = [];
  if (status !== "ALL") filterSummaryParts.push(`Status: ${STATUS_LABELS[status as ReferralReportStatus]}`);
  if (search) filterSummaryParts.push(`Search: "${search}"`);
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(" | ") : undefined;
  const dateRangeLabel = data?.range.label ?? "";

  return (
    <div className="space-y-5">
      <ReportPageHeader title="Referral Report" description="Referrals, qualifying orders and wallet rewards." />
      <ReportPrintHeader shop={shop} reportTitle="Referral Report" dateRangeLabel={dateRangeLabel} />

      <ReportFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search referrer or referred customer name or phone"
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      >
        <div className="w-40">
          <ReportSelect value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
        </div>
      </ReportFilterBar>

      <ReportExportButtons
        reportTitle="Referral Report"
        dateRangeLabel={dateRangeLabel}
        filterSummary={filterSummary}
        shop={shop}
        columns={COLUMNS}
        summary={summaryCards}
        fileBaseName={`referral-report_${dateRange.from}_to_${dateRange.to}`}
        fetchAllRows={async () => {
          const res = await api.get<ReportApiResponse>(`/api/admin/reports/referrals?${buildParams({ all: true }).toString()}`);
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
        emptyMessage="No referrals found for this filter."
      />
    </div>
  );
}
