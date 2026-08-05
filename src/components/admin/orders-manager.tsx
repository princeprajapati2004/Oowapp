"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, ExternalLink, Search, X, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import type { DuplicateOrderData } from "@/components/admin/create-order-page";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { useOrderEvents, type OrderEventOrder } from "@/lib/hooks/use-order-events";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
type OrderStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

type OrderRow = {
  id: string;
  billNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  createdAt: Date | string;
  status?: OrderStatus;
  source?: string;
  paymentMethod?: string | null;
  items: { id: string; name: string; quantity: number; price: number; lineTotal: number; productId?: string | null }[];
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400",
  READY: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  COMPLETED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
};

const ALL_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"];

function toOrderRow(order: OrderEventOrder): OrderRow {
  return {
    id: order.id,
    billNumber: order.billNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    tableNumber: order.tableNumber,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    grandTotal: order.grandTotal,
    createdAt: order.createdAt,
    status: order.status as OrderStatus,
    source: order.source,
    paymentMethod: order.paymentMethod,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      lineTotal: item.lineTotal,
      productId: item.productId,
    })),
  };
}

const DUPLICATE_HANDOFF_KEY = "oowapp:duplicateOrder";

export function OrdersManager({
  initialOrders,
  currency,
  initialQuery,
}: {
  initialOrders: OrderRow[];
  currency: string;
  shopSlug?: string;
  initialQuery?: string;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // Deep-linked from the create-order page's "Order history" button
  // (?q=<phone>) as well as manual typing here.
  const [query, setQuery] = useState(initialQuery ?? "");

  const filtered = orders
    .filter((o) => statusFilter === "ALL" || (o.status ?? "PENDING") === statusFilter)
    .filter((o) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        (o.customerName ?? "").toLowerCase().includes(q) ||
        (o.customerPhone ?? "").toLowerCase().includes(q) ||
        o.billNumber.toLowerCase().includes(q)
      );
    });

  function handleDuplicate(order: OrderRow) {
    const items = order.items
      .filter((item): item is typeof item & { productId: string } => !!item.productId)
      .map((item) => ({ productId: item.productId, quantity: item.quantity }));
    const payload: DuplicateOrderData = {
      items,
      customerName: order.customerName ?? undefined,
      customerPhone: order.customerPhone ?? undefined,
      tableNumber: order.tableNumber ?? undefined,
    };
    // One-shot hand-off — the create-order page reads and immediately
    // clears this on mount (see create-order-page.tsx). sessionStorage
    // rather than a prop since it's now a real page navigation, not a
    // dialog within this same component tree.
    sessionStorage.setItem(DUPLICATE_HANDOFF_KEY, JSON.stringify(payload));
    router.push("/admin/orders/create");
  }

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: (order) => {
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [toOrderRow(order), ...prev]));
      toast.success(`New order — #${order.billNumber}`);
    },
    onUpdated: (order) => {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? toOrderRow(order) : o)));
    },
  });

  async function updateStatus(orderId: string, status: OrderStatus) {
    const prevOrders = orders;
    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
    setUpdatingId(orderId);
    try {
      await api.patch(`/api/admin/orders/${orderId}`, { status });
    } catch (error) {
      setOrders(prevOrders);
      toast.error(error instanceof ApiError ? error.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">{orders.length} order{orders.length !== 1 ? "s" : ""} placed through your menu.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, bill no."
              className="h-9 w-52 pl-8 pr-7"
              aria-label="Search orders"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "ALL")}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue>{statusFilter === "ALL" ? "All statuses" : STATUS_LABELS[statusFilter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders found"
          description={
            query.trim()
              ? `No orders match "${query.trim()}".`
              : statusFilter === "ALL"
                ? "Orders placed by customers will show up here."
                : `No orders with status "${STATUS_LABELS[statusFilter]}".`
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28">Bill No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Table / Address</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Date</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const status: OrderStatus = (order.status as OrderStatus) ?? "PENDING";
                return (
                  <TableRow key={order.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                      <div>{order.billNumber}</div>
                      {order.source === "manual" && (
                        <Badge variant="outline" className="mt-0.5 text-[10px] px-1 py-0 h-3.5 border-blue-300 text-blue-600">
                          Manual
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{order.customerName || "—"}</div>
                      {order.customerPhone ? (
                        <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-32 truncate">
                      {order.tableNumber || order.deliveryAddress || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className="font-medium">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={status}
                        onValueChange={(v) => updateStatus(order.id, v as OrderStatus)}
                        disabled={updatingId === order.id}
                      >
                        <SelectTrigger className="h-7 w-auto border-0 bg-transparent p-0 focus:ring-0 [&>svg]:ml-1">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
                            {STATUS_LABELS[status]}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium mr-1 ${STATUS_COLORS[s]}`}>
                                {STATUS_LABELS[s]}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-sm">
                        {formatCurrency(order.grandTotal, currency)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <div className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </TableCell>
                    <TableCell className="p-1">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => handleDuplicate(order)}
                          aria-label="Duplicate order"
                          title="Duplicate order"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          render={<Link href={`/admin/orders/${order.id}`} />}
                          aria-label="View bill"
                        >
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
