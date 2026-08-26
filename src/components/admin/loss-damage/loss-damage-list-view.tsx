"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PackageX, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SummaryStatTiles } from "@/components/shared/summary-stat-tiles";
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import type { LossDamagePayload, LossDamageSummary } from "@/lib/services/loss-damage";
import { LossDamageCard } from "./loss-damage-card";
import { LossDamageFiltersBar, DEFAULT_LOSS_DAMAGE_FILTERS, type LossDamageFilters } from "./loss-damage-filters-bar";
import { AddLossDamageDialog } from "./add-loss-damage-dialog";

type SearchResponse = {
  records: LossDamagePayload[];
  nextCursor: string | null;
  hasMore: boolean;
  summary: LossDamageSummary | null;
};

function buildQuery(filters: LossDamageFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.type !== "ALL") params.set("type", filters.type);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function LossDamageListView({
  initialRecords,
  initialNextCursor,
  initialHasMore,
  initialSummary,
  currency,
}: {
  initialRecords: LossDamagePayload[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  initialSummary: LossDamageSummary;
  currency: string;
}) {
  const [filters, setFilters] = useState<LossDamageFilters>(DEFAULT_LOSS_DAMAGE_FILTERS);
  const [records, setRecords] = useState(initialRecords);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const isDefaultFilters = JSON.stringify(filters) === JSON.stringify(DEFAULT_LOSS_DAMAGE_FILTERS);

  const runSearch = useCallback(async (nextFilters: LossDamageFilters) => {
    setLoading(true);
    try {
      const qs = buildQuery(nextFilters);
      const result = await api.get<SearchResponse>(`/api/admin/loss-damage${qs ? `?${qs}` : ""}`);
      setRecords(result.records);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      if (result.summary) setSummary(result.summary);
    } catch {
      toast.error("Couldn't load loss & damage records");
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
      const result = await api.get<SearchResponse>(`/api/admin/loss-damage?${qs}`);
      setRecords((prev) => [...prev, ...result.records]);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch {
      toast.error("Couldn't load more records");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Loss & Damage</h1>
          <p className="text-muted-foreground text-sm">Track stock lost, damaged, or written off.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="size-4" /> Add Loss / Damage
        </Button>
      </div>

      <SummaryStatTiles
        tiles={[
          { label: "Total Records", value: String(summary.totalRecords) },
          { label: "Items Lost", value: String(summary.totalItemsLost) },
          { label: "Items Damaged", value: String(summary.totalItemsDamaged), accent: "text-red-600 dark:text-red-400" },
          { label: "This Month Loss", value: formatCurrency(summary.thisMonthLossValue, currency) },
        ]}
      />

      <LossDamageFiltersBar filters={filters} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="No loss or damage recorded"
          description={
            isDefaultFilters
              ? "Lost, damaged, or wasted stock you record will show up here."
              : "No records match your current search and filters."
          }
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <LossDamageCard key={r.id} record={r} currency={currency} />
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

      <AddLossDamageDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        currency={currency}
        onCreated={(created) => {
          setRecords((prev) => [created, ...prev]);
          setSummary((prev) => ({
            totalRecords: prev.totalRecords + 1,
            totalItemsLost: prev.totalItemsLost + (created.type !== "DAMAGED" && created.type !== "BROKEN" && created.type !== "SPOILED" ? created.quantity : 0),
            totalItemsDamaged: prev.totalItemsDamaged + (created.type === "DAMAGED" || created.type === "BROKEN" || created.type === "SPOILED" ? created.quantity : 0),
            totalLossValue: prev.totalLossValue + (created.totalLossValue ?? 0),
            thisMonthLossValue: prev.thisMonthLossValue + (created.totalLossValue ?? 0),
          }));
        }}
      />
    </div>
  );
}
