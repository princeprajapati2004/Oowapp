"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { formatCurrency } from "@/lib/utils/currency";
import { SummaryStatTiles } from "@/components/shared/summary-stat-tiles";
import type { ReturnEventPayload } from "@/lib/server/order-events";
import type { ReturnSummary } from "@/lib/services/return-search";
import { ReturnCard } from "./return-card";
import { ReturnFiltersBar, DEFAULT_RETURN_FILTERS, type ReturnFilters } from "./return-filters-bar";

type SearchResponse = {
  returns: ReturnEventPayload[];
  nextCursor: string | null;
  hasMore: boolean;
  summary: ReturnSummary | null;
};

function buildQuery(filters: ReturnFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function ReturnsListView({
  initialReturns,
  initialNextCursor,
  initialHasMore,
  initialSummary,
  currency,
}: {
  initialReturns: ReturnEventPayload[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  initialSummary: ReturnSummary;
  currency: string;
}) {
  const [filters, setFilters] = useState<ReturnFilters>(DEFAULT_RETURN_FILTERS);
  const [returns, setReturns] = useState(initialReturns);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const isDefaultFilters = JSON.stringify(filters) === JSON.stringify(DEFAULT_RETURN_FILTERS);

  const runSearch = useCallback(async (nextFilters: ReturnFilters) => {
    setLoading(true);
    try {
      const qs = buildQuery(nextFilters);
      const result = await api.get<SearchResponse>(`/api/admin/returns${qs ? `?${qs}` : ""}`);
      setReturns(result.returns);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      if (result.summary) setSummary(result.summary);
    } catch {
      toast.error("Couldn't load returns");
    } finally {
      setLoading(false);
    }
  }, []);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    runSearch(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const qs = buildQuery(filters, nextCursor);
      const result = await api.get<SearchResponse>(`/api/admin/returns?${qs}`);
      setReturns((prev) => [...prev, ...result.returns]);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch {
      toast.error("Couldn't load more returns");
    } finally {
      setLoadingMore(false);
    }
  }

  useOrderEvents("/api/admin/orders/stream", {
    onReturnCreated: (returnRequest) => {
      if (!isDefaultFilters) return;
      setReturns((prev) => (prev.some((r) => r.id === returnRequest.id) ? prev : [returnRequest, ...prev]));
      toast.success(`New return request — Order #${returnRequest.orderBillNumber}`);
    },
    onReturnUpdated: (returnRequest) => {
      setReturns((prev) => prev.map((r) => (r.id === returnRequest.id ? returnRequest : r)));
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Returns & Refunds</h1>
        <p className="text-muted-foreground text-sm">Manage item returns and refunds across all orders.</p>
      </div>

      <SummaryStatTiles
        tiles={[
          { label: "Total Returns", value: String(summary.totalReturns) },
          { label: "Pending Refunds", value: String(summary.pendingRefunds), accent: "text-amber-600 dark:text-amber-400" },
          { label: "Total Refunded", value: formatCurrency(summary.totalRefunded, currency) },
          { label: "This Month Refunds", value: formatCurrency(summary.thisMonthRefunded, currency) },
        ]}
      />

      <ReturnFiltersBar filters={filters} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : returns.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No returns found"
          description={
            isDefaultFilters
              ? "Return and refund requests will show up here."
              : "No returns match your current search and filters."
          }
        />
      ) : (
        <div className="space-y-2">
          {returns.map((r) => (
            <ReturnCard key={r.id} returnRequest={r} currency={currency} />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
