"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";
import { OrderCard } from "./order-card";
import { OrderFiltersBar, DEFAULT_ORDER_FILTERS, type OrderFilters } from "./order-filters-bar";

type SearchResponse = {
  orders: AdminOrderEventOrder[];
  nextCursor: string | null;
  hasMore: boolean;
};

function buildQuery(filters: OrderFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.paymentStatus !== "ALL") params.set("paymentStatus", filters.paymentStatus);
  if (filters.type !== "ALL") params.set("type", filters.type);
  if (filters.source !== "ALL") params.set("source", filters.source);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function OrdersListView({
  initialOrders,
  initialNextCursor,
  initialHasMore,
  initialSearch,
  currency,
}: {
  initialOrders: AdminOrderEventOrder[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  initialSearch: string;
  currency: string;
}) {
  const [filters, setFilters] = useState<OrderFilters>({ ...DEFAULT_ORDER_FILTERS, search: initialSearch });
  const [orders, setOrders] = useState(initialOrders);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const isDefaultFilters = JSON.stringify(filters) === JSON.stringify(DEFAULT_ORDER_FILTERS);

  const runSearch = useCallback(async (nextFilters: OrderFilters) => {
    setLoading(true);
    try {
      const qs = buildQuery(nextFilters);
      const result = await api.get<SearchResponse>(`/api/admin/orders${qs ? `?${qs}` : ""}`);
      setOrders(result.orders);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch {
      toast.error("Couldn't load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  // Skip the redundant fetch on first mount — initialOrders already reflects
  // the server-rendered page's filters (including any ?search= it read). A
  // ref (not state) so the skip itself never triggers a render/effect cycle.
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
      const result = await api.get<SearchResponse>(`/api/admin/orders?${qs}`);
      setOrders((prev) => [...prev, ...result.orders]);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch {
      toast.error("Couldn't load more orders");
    } finally {
      setLoadingMore(false);
    }
  }

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: (order) => {
      if (!isDefaultFilters) return; // avoid surprising a filtered view
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [
        {
          ...order,
          tokenNumber: null,
          paidAmount: null,
          transactionReference: null,
          paymentConfirmedBy: null,
          paymentConfirmedAt: null,
          cancelReason: null,
          cancelledAt: null,
          cancelledBy: null,
          ownerNote: null,
          staffId: null,
          statusEvents: [],
        },
        ...prev,
      ]));
      toast.success(`New order — #${order.billNumber}`);
    },
    onUpdated: (order) => {
      // `order` here is the safe SSE subset (no changedBy on statusEvents) —
      // merge everything except statusEvents so we don't downgrade the
      // richer admin copy already held locally.
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, ...order, statusEvents: o.statusEvents } : o))
      );
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground text-sm">Click on any order to view details & manage payments.</p>
      </div>

      <OrderFiltersBar filters={filters} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders found"
          description={
            isDefaultFilters
              ? "Orders placed through your menu will show up here."
              : "No orders match your current search and filters."
          }
        />
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} currency={currency} />
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
