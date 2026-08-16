"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Table2,
  CircleCheck,
  Clock,
  Users,
  Loader2,
  Minus,
  Plus,
  Trash2,
  DoorOpen,
  ChevronDown,
  ChevronUp,
  Phone,
  User,
  PackagePlus,
  Printer,
  MoreVertical,
  CalendarClock,
  Droplets,
  Ban,
  ArrowLeftRight,
  Merge,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { AddItemsPanel } from "@/components/admin/add-items-panel";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import type { Product, CartItem } from "@/lib/types/manual-order";
import type { TableBoardEntry, TableManualState } from "@/lib/services/table-session";

type SessionLabel = "Preparing" | "Served" | "Awaiting payment" | "Paid";

type OrderItem = {
  id: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
};

type DetailOrder = {
  id: string;
  billNumber: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  createdAt: string;
  items: OrderItem[];
};

type SessionDetail = {
  id: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  guestCount: number | null;
  createdAt: string;
  billRequestedAt: string | null;
  orders: DetailOrder[];
};

const LABEL_BADGE: Record<SessionLabel, string> = {
  Preparing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Served: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Awaiting payment": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI App" },
  { value: "QR", label: "Scan QR" },
  { value: "CARD", label: "Card" },
  { value: "WALLET", label: "Wallet" },
  { value: "SPLIT", label: "Split" },
  { value: "OTHER", label: "Other" },
] as const;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Summary stat card ─────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3 text-center">
      <p className={cn("text-2xl font-bold tabular-nums", accent)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────
export function TablesBoard({ initialTables, currency }: { initialTables: TableBoardEntry[]; currency: string }) {
  const router = useRouter();
  const [tables, setTables] = useState(initialTables);
  const [detailTarget, setDetailTarget] = useState<TableBoardEntry | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ tables: TableBoardEntry[] }>("/api/admin/table-sessions");
      setTables(res.tables);
    } catch { /* SSE or next manual reload will retry */ }
  }, []);

  useOrderEvents("/api/admin/orders/stream", {
    onCreated: () => refresh(),
    onUpdated: () => refresh(),
    onSessionUpdated: () => refresh(),
  });

  async function setTableState(tableNumber: string, state: TableManualState | null) {
    try {
      await api.patch("/api/admin/table-sessions", { tableNumber, state });
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update table");
    }
  }

  const total = tables.length;
  const available = tables.filter((t) => !t.occupied && !t.manualState).length;
  const occupied = tables.filter((t) => t.occupied && t.session?.status === "ACTIVE").length;
  const awaitingPayment = tables.filter((t) => t.session?.status === "AWAITING_PAYMENT").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Tables</h1>
        <p className="text-sm text-muted-foreground">
          {occupied} occupied · {available} available · {awaitingPayment} awaiting payment
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Tables" value={total} />
        <StatCard label="Available" value={available} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Occupied" value={occupied} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Awaiting Payment" value={awaitingPayment} accent="text-violet-600 dark:text-violet-400" />
      </div>

      {tables.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="No tables configured"
          description="Add table names in Settings → Restaurant settings to get started."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {tables.map((table) => (
            <TableCard
              key={table.tableNumber}
              table={table}
              currency={currency}
              onViewDetail={() => setDetailTarget(table)}
              onCreateOrder={() => router.push(`/admin/orders/create?type=DINE_IN&table=${encodeURIComponent(table.tableNumber)}`)}
              onSetState={(state) => setTableState(table.tableNumber, state)}
            />
          ))}
        </div>
      )}

      <TableDetailDialog
        table={detailTarget}
        currency={currency}
        allTables={tables}
        onClose={() => setDetailTarget(null)}
        onChanged={() => {
          setDetailTarget(null);
          refresh();
        }}
      />
    </div>
  );
}

// Staff-set states for a table with no active session — an active session's
// own status always wins over these (see toBoardEntry in table-session.ts).
const STATE_META: Record<TableManualState, { label: string; badge: string; icon: typeof Ban; blocksOrder: boolean }> = {
  RESERVED: {
    label: "Reserved",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    icon: CalendarClock,
    blocksOrder: false,
  },
  CLEANING: {
    label: "Cleaning",
    badge: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: Droplets,
    blocksOrder: true,
  },
  DISABLED: {
    label: "Out of service",
    badge: "bg-neutral-300 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300",
    icon: Ban,
    blocksOrder: true,
  },
};

// ── Table card ────────────────────────────────────────────────────────────────
// Deliberately compact — just the table number, its status, and (when
// occupied) a one-line amount/customer hint. Everything else — time, guest
// count, rounds, paid/due, actions — lives one tap away in TableDetailDialog,
// which the whole card opens for an occupied table.
function TableCard({
  table,
  currency,
  onViewDetail,
  onCreateOrder,
  onSetState,
}: {
  table: TableBoardEntry;
  currency: string;
  onViewDetail: () => void;
  onCreateOrder: () => void;
  onSetState: (state: TableManualState | null) => void;
}) {
  if (!table.occupied || !table.session) {
    const meta = table.manualState ? STATE_META[table.manualState] : null;
    const blocked = meta?.blocksOrder ?? false;
    const StateIcon = meta?.icon;

    return (
      <div className="w-full rounded-xl border border-dashed bg-muted/20 p-3 transition-colors">
        <div className="flex items-start justify-between gap-1">
          <button
            type="button"
            onClick={blocked ? undefined : onCreateOrder}
            disabled={blocked}
            className={cn(
              "min-w-0 flex-1 rounded-lg -m-1 p-1 text-left transition-colors",
              !blocked && "hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
            )}
          >
            <p className="truncate text-sm font-bold text-muted-foreground">Table {table.tableNumber}</p>
            <span
              className={cn(
                "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                meta ? meta.badge : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}
            >
              {StateIcon && <StateIcon className="size-3" />}
              {meta ? meta.label : "Available"}
            </span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0 -mr-1 -mt-1 text-muted-foreground")}
              aria-label="Table actions"
            >
              <MoreVertical className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!blocked && (
                <DropdownMenuItem onClick={onCreateOrder}>
                  <Plus className="size-4" /> Create order
                </DropdownMenuItem>
              )}
              {(!blocked || meta) && <DropdownMenuSeparator />}
              {table.manualState !== "RESERVED" && (
                <DropdownMenuItem onClick={() => onSetState("RESERVED")}>
                  <CalendarClock className="size-4" /> Mark Reserved
                </DropdownMenuItem>
              )}
              {table.manualState !== "CLEANING" && (
                <DropdownMenuItem onClick={() => onSetState("CLEANING")}>
                  <Droplets className="size-4" /> Mark Cleaning
                </DropdownMenuItem>
              )}
              {table.manualState !== "DISABLED" && (
                <DropdownMenuItem onClick={() => onSetState("DISABLED")}>
                  <Ban className="size-4" /> Disable table
                </DropdownMenuItem>
              )}
              {meta && (
                <DropdownMenuItem onClick={() => onSetState(null)}>
                  <CircleCheck className="size-4" /> Set Available
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  const { session } = table;
  return (
    <button
      type="button"
      onClick={onViewDetail}
      className="w-full rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
    >
      <div className="flex items-start justify-between gap-1">
        <p className="truncate text-sm font-bold">Table {table.tableNumber}</p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", LABEL_BADGE[session.label])}>
          {session.label}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {session.customerName ? `${session.customerName} · ` : ""}
        {formatCurrency(session.grandTotal, currency)}
      </p>
    </button>
  );
}

// ── Table detail dialog ───────────────────────────────────────────────────────
function TableDetailDialog({
  table,
  currency,
  allTables,
  onClose,
  onChanged,
}: {
  table: TableBoardEntry | null;
  currency: string;
  allTables: TableBoardEntry[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseNote, setReleaseNote] = useState("");
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);
  const [guestCountInput, setGuestCountInput] = useState("");
  const [savingGuestCount, setSavingGuestCount] = useState(false);
  const [payMethod, setPayMethod] = useState<(typeof PAYMENT_METHODS)[number]["value"]>("CASH");
  const [payNote, setPayNote] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [rejectingPayment, setRejectingPayment] = useState(false);

  // "Add More Items" — a new round on this table's existing session.
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [catalogLoadedAt, setCatalogLoadedAt] = useState(0);
  const [addItemsOpen, setAddItemsOpen] = useState(false);
  const [addCart, setAddCart] = useState<CartItem[]>([]);
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [addingItems, setAddingItems] = useState(false);

  const open = !!table;

  // Fetch detail when dialog opens
  async function loadDetail(sessionId: string) {
    setLoading(true);
    setError(false);
    setDetail(null);
    setExpandedOrder(null);
    setEditingOrder(null);
    setShowReleaseConfirm(false);
    setShowPayConfirm(false);
    setShowTransferDialog(false);
    setTransferTarget("");
    setShowMergeDialog(false);
    setMergeTarget("");
    setAddItemsOpen(false);
    setAddCart([]);
    setShowAddConfirm(false);
    try {
      const data = await api.get<SessionDetail>(`/api/admin/table-sessions/${sessionId}`);
      setDetail(data);
      setGuestCountInput(data.guestCount != null ? String(data.guestCount) : "");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      setDetail(null);
      setAddItemsOpen(false);
      setAddCart([]);
      setShowAddConfirm(false);
    }
  }

  // Clears stale detail once the dialog closes, however it closed — adjusted
  // during render (not an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setDetail(null);
  }

  // Load detail whenever the dialog opens or the session changes.
  useEffect(() => {
    if (!open || !table?.session?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail(table.session.id);
  }, [open, table?.session?.id]);

  // All non-cancelled items merged for the summary view
  const mergedItems = detail
    ? (() => {
        const map = new Map<string, { name: string; price: number; quantity: number }>();
        detail.orders
          .filter((o) => o.status !== "CANCELLED")
          .flatMap((o) => o.items)
          .forEach((item) => {
            const key = item.productId ?? item.name;
            const existing = map.get(key);
            if (existing) {
              map.set(key, { ...existing, quantity: existing.quantity + item.quantity });
            } else {
              map.set(key, { name: item.name, price: item.price, quantity: item.quantity });
            }
          });
        return Array.from(map.values());
      })()
    : [];

  const sessionTotal = mergedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Free tables this session could move to — excludes the current table,
  // anything occupied, and anything explicitly out of service.
  const destinationTables = allTables.filter(
    (t) => t.tableNumber !== table?.tableNumber && !t.occupied && t.manualState !== "DISABLED"
  );

  // Other occupied tables this session's orders could be merged into.
  const mergeCandidates = allTables.filter((t) => t.tableNumber !== table?.tableNumber && t.occupied && t.session);

  function startEditOrder(order: DetailOrder) {
    const qty: Record<string, number> = {};
    order.items.forEach((item) => { qty[item.id] = item.quantity; });
    setEditQuantities(qty);
    setEditingOrder(order.id);
  }

  async function saveEditOrder(orderId: string) {
    setSavingEdit(true);
    try {
      const updates = Object.entries(editQuantities).map(([id, quantity]) => ({ id, quantity }));
      await api.patch(`/api/admin/orders/${orderId}`, { action: "edit_items", items: updates });
      toast.success("Order updated");
      setEditingOrder(null);
      if (table?.session) await loadDetail(table.session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update order");
    } finally {
      setSavingEdit(false);
    }
  }

  async function cancelOrder(orderId: string) {
    try {
      await api.patch(`/api/admin/orders/${orderId}`, { action: "status", status: "CANCELLED" });
      toast.success("Order cancelled");
      if (table?.session) await loadDetail(table.session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel order");
    }
  }

  async function handleRelease() {
    if (!table?.session) return;
    setReleasing(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, {
        action: "release_table",
        paymentNote: releaseNote.trim() || undefined,
      });
      toast.success(`Table ${table.tableNumber} released`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't release table");
    } finally {
      setReleasing(false);
    }
  }

  async function saveGuestCount() {
    if (!table?.session) return;
    const trimmed = guestCountInput.trim();
    const num = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (!Number.isFinite(num) || (num as number) < 0)) {
      toast.error("Enter a valid number of guests");
      return;
    }
    setSavingGuestCount(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, { action: "set_guest_count", guestCount: num });
      await loadDetail(table.session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update guest count");
    } finally {
      setSavingGuestCount(false);
    }
  }

  async function handleTransfer() {
    if (!table?.session || !transferTarget) return;
    setTransferring(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, {
        action: "transfer_table",
        newTableNumber: transferTarget,
      });
      toast.success(`Table ${table.tableNumber} moved to Table ${transferTarget}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't transfer this table");
    } finally {
      setTransferring(false);
    }
  }

  async function handleMerge() {
    if (!table?.session || !mergeTarget) return;
    setMerging(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, {
        action: "merge_into",
        targetTableNumber: mergeTarget,
      });
      toast.success(`Table ${table.tableNumber} merged into Table ${mergeTarget}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't merge these tables");
    } finally {
      setMerging(false);
    }
  }

  async function handleRejectPayment() {
    if (!table?.session) return;
    setRejectingPayment(true);
    try {
      await api.patch(`/api/admin/table-sessions/${table.session.id}`, { action: "reject_payment" });
      toast.success(`Payment rejected — table ${table.tableNumber} back to ordering`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reject this payment");
    } finally {
      setRejectingPayment(false);
    }
  }

  async function handleMarkPaid() {
    if (!table?.session) return;
    const parsedAmount = payAmount.trim() ? parseFloat(payAmount) : undefined;
    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setPaying(true);
    try {
      const res = await api.patch<{ ok: boolean; partial?: boolean; remaining?: number }>(
        `/api/admin/table-sessions/${table.session.id}`,
        {
          action: "mark_paid",
          paymentMethod: payMethod,
          paymentNote: payNote.trim() || undefined,
          paidAmount: parsedAmount,
        }
      );
      toast.success(
        res.partial
          ? `Payment recorded — ${formatCurrency(res.remaining ?? 0, currency)} still due on Table ${table.tableNumber}`
          : `Table ${table.tableNumber} marked as paid`
      );
      setPayAmount("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't mark as paid");
    } finally {
      setPaying(false);
    }
  }

  async function openAddItems() {
    setAddItemsOpen(true);
    if (products.length > 0) return;
    setLoadingProducts(true);
    try {
      const data = await api.get<Product[]>("/api/admin/products");
      setProducts(data.filter((p) => p.isAvailable && p.isVisible));
      setCatalogLoadedAt(Date.now());
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  }

  function addToAddCart(product: Product) {
    setAddCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: 1,
          categoryId: product.category.id,
          categoryName: product.category.name,
          imageUrl: product.imageUrl,
        },
      ];
    });
  }

  function updateAddCartQty(productId: string, delta: number) {
    setAddCart((prev) => {
      const next = prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i));
      return next.filter((i) => i.quantity > 0);
    });
  }

  function closeAddItemsPanel() {
    setAddItemsOpen(false);
    if (addCart.length > 0) setShowAddConfirm(true);
  }

  async function handleConfirmAddItems() {
    if (!table || addCart.length === 0) return;
    setAddingItems(true);
    try {
      await api.post("/api/admin/orders", {
        tableNumber: table.tableNumber,
        paymentMethod: "PENDING",
        customerName: detail?.customerName ?? undefined,
        customerPhone: detail?.customerPhone ?? undefined,
        items: addCart.map(({ productId, name, price, quantity, categoryId }) => ({
          productId,
          name,
          price,
          quantity,
          categoryId,
        })),
      });
      toast.success("Items added to the table");
      setAddCart([]);
      setShowAddConfirm(false);
      if (table.session) await loadDetail(table.session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add items");
    } finally {
      setAddingItems(false);
    }
  }

  const isClosed = detail?.status === "PAID";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Table2 className="size-4 text-primary" />
              Table {table?.tableNumber}
            </span>
            {detail && (
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
                detail.status === "ACTIVE" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                detail.status === "AWAITING_PAYMENT" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}>
                {detail.status === "ACTIVE" ? "Active" : detail.status === "AWAITING_PAYMENT" ? "Awaiting Payment" : "Paid"}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-center py-10 text-sm text-destructive">
              Couldn&apos;t load table details.{" "}
              <button className="underline" onClick={() => table?.session && loadDetail(table.session.id)}>
                Retry
              </button>
            </div>
          )}

          {detail && (
            <>
              {/* Customer info */}
              {(detail.customerName || detail.customerPhone) && (
                <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-1.5 text-sm">
                  {detail.customerName && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="size-3.5" /> <span>{detail.customerName}</span>
                    </div>
                  )}
                  {detail.customerPhone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5" /> <span>{detail.customerPhone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Guest count */}
              {!isClosed && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Guests"
                    value={guestCountInput}
                    onChange={(e) => setGuestCountInput(e.target.value)}
                    onBlur={() => {
                      if (guestCountInput.trim() !== String(detail.guestCount ?? "")) saveGuestCount();
                    }}
                    className="h-8 w-24 text-sm"
                    disabled={savingGuestCount}
                  />
                  <span className="text-xs text-muted-foreground">guests</span>
                </div>
              )}

              {/* Time info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" /> Opened at {formatTime(detail.createdAt)}
                </span>
                <span>{formatDuration(detail.createdAt)} ago</span>
              </div>

              {/* Summary of all items */}
              <div className="rounded-xl border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  All Items Ordered
                </div>
                <div className="divide-y">
                  {mergedItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="font-medium">{item.name} <span className="text-muted-foreground font-normal">× {item.quantity}</span></span>
                      <span className="font-semibold tabular-nums">{formatCurrency(item.price * item.quantity, currency)}</span>
                    </div>
                  ))}
                  {mergedItems.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No active items.</p>
                  )}
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10 font-bold text-sm">
                  <span>Total</span>
                  <span className="text-primary text-base tabular-nums">{formatCurrency(sessionTotal, currency)}</span>
                </div>
              </div>

              {/* Individual orders */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orders ({detail.orders.length})</p>
                {detail.orders.map((order, idx) => (
                  <div key={order.id} className={cn("rounded-xl border overflow-hidden", order.status === "CANCELLED" && "opacity-50")}>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    >
                      <div>
                        <p className="text-sm font-semibold">Round {idx + 1} — {order.billNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)} · {order.status}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-sm">{formatCurrency(order.grandTotal, currency)}</span>
                        {expandedOrder === order.id ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {expandedOrder === order.id && (
                      <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
                        {/* Items list */}
                        <div className="space-y-2">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="flex-1 font-medium">{item.name}</span>
                              {editingOrder === order.id ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    className="flex size-6 items-center justify-center rounded-full bg-muted hover:bg-muted/80"
                                    onClick={() => setEditQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] ?? item.quantity) - 1) }))}
                                  >
                                    <Minus className="size-3" />
                                  </button>
                                  <span className="w-6 text-center tabular-nums font-semibold">
                                    {editQuantities[item.id] ?? item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    className="flex size-6 items-center justify-center rounded-full bg-muted hover:bg-muted/80"
                                    onClick={() => setEditQuantities((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? item.quantity) + 1 }))}
                                  >
                                    <Plus className="size-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="tabular-nums text-muted-foreground">× {item.quantity}</span>
                              )}
                              <span className="font-semibold tabular-nums w-20 text-right">
                                {formatCurrency(
                                  item.price * (editingOrder === order.id ? (editQuantities[item.id] ?? item.quantity) : item.quantity),
                                  currency
                                )}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Order actions */}
                        {order.status !== "CANCELLED" && !isClosed && (
                          <div className="flex gap-2 pt-1 border-t">
                            {editingOrder === order.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-8 text-xs"
                                  onClick={() => setEditingOrder(null)}
                                  disabled={savingEdit}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1 h-8 text-xs"
                                  onClick={() => saveEditOrder(order.id)}
                                  disabled={savingEdit}
                                >
                                  {savingEdit ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-8 text-xs gap-1"
                                  onClick={() => startEditOrder(order)}
                                >
                                  <Minus className="size-3" /> Edit Items
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={() => cancelOrder(order.id)}
                                >
                                  <Trash2 className="size-3" /> Cancel Order
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add more items / Print bill */}
              <div className="flex gap-2">
                {detail.status === "ACTIVE" && (
                  <Button size="sm" variant="outline" className="flex-1 h-9 gap-1.5 text-xs" onClick={openAddItems}>
                    <PackagePlus className="size-3.5" /> Add More Items
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 gap-1.5 text-xs"
                  onClick={() => window.open(`/admin/tables/${detail.id}/bill`, "_blank")}
                >
                  <Printer className="size-3.5" /> Print Bill
                </Button>
              </div>

              {!isClosed && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 gap-1.5 text-xs"
                    onClick={() => setShowTransferDialog((v) => !v)}
                  >
                    <ArrowLeftRight className="size-3.5" /> Transfer Table
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 gap-1.5 text-xs"
                    onClick={() => setShowMergeDialog((v) => !v)}
                  >
                    <Merge className="size-3.5" /> Merge Table
                  </Button>
                </div>
              )}

              {showTransferDialog && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-semibold">Move Table {table?.tableNumber} to…</p>
                  {destinationTables.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No other free tables right now.</p>
                  ) : (
                    <Select value={transferTarget} onValueChange={(v) => v && setTransferTarget(v as string)}>
                      <SelectTrigger className="h-9 w-full text-sm">
                        <SelectValue placeholder="Select destination table">
                          {(v: string | null) => (v ? `Table ${v}` : "Select destination table")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {destinationTables.map((t) => (
                          <SelectItem key={t.tableNumber} value={t.tableNumber}>
                            Table {t.tableNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowTransferDialog(false);
                        setTransferTarget("");
                      }}
                      disabled={transferring}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1 gap-1.5" onClick={handleTransfer} disabled={transferring || !transferTarget}>
                      {transferring ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
                      Move Table
                    </Button>
                  </div>
                </div>
              )}

              {showMergeDialog && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-semibold">Merge Table {table?.tableNumber} into…</p>
                  <p className="text-xs text-muted-foreground">
                    All of this table&apos;s rounds move onto the target table&apos;s bill. Table {table?.tableNumber} becomes available.
                  </p>
                  {mergeCandidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No other occupied tables to merge into right now.</p>
                  ) : (
                    <Select value={mergeTarget} onValueChange={(v) => v && setMergeTarget(v as string)}>
                      <SelectTrigger className="h-9 w-full text-sm">
                        <SelectValue placeholder="Select target table">
                          {(v: string | null) => (v ? `Table ${v}` : "Select target table")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {mergeCandidates.map((t) => (
                          <SelectItem key={t.tableNumber} value={t.tableNumber}>
                            Table {t.tableNumber} {t.session ? `— ${formatCurrency(t.session.grandTotal, currency)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowMergeDialog(false);
                        setMergeTarget("");
                      }}
                      disabled={merging}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1 gap-1.5" onClick={handleMerge} disabled={merging || !mergeTarget}>
                      {merging ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />}
                      Merge Table
                    </Button>
                  </div>
                </div>
              )}

              {showAddConfirm && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-semibold">Add {addCart.length} item{addCart.length === 1 ? "" : "s"} to Table {table?.tableNumber}?</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {addCart.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between text-sm">
                        <span>{item.name} × {item.quantity}</span>
                        <span className="font-medium tabular-nums">{formatCurrency(item.price * item.quantity, currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setShowAddConfirm(false); setAddCart([]); }}
                      disabled={addingItems}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1 gap-1.5" onClick={handleConfirmAddItems} disabled={addingItems}>
                      {addingItems ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
                      Add to Table
                    </Button>
                  </div>
                </div>
              )}

              {/* Mark Paid */}
              {!isClosed && (
                <>
                  {showPayConfirm ? (
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <p className="text-sm font-semibold">Confirm Payment — Table {table?.tableNumber}</p>
                      {table?.session && table.session.paidAmount > 0 && (
                        <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                          <span className="text-emerald-600 dark:text-emerald-400">Already paid {formatCurrency(table.session.paidAmount, currency)}</span>
                          <span className="font-bold">{formatCurrency(table.session.remaining, currency)} due</span>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount to collect</p>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder={(table?.session?.remaining ?? table?.session?.grandTotal ?? 0).toFixed(2)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => setPayMethod(m.value)}
                            className={cn(
                              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                              payMethod === m.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <Textarea
                        placeholder={payMethod === "SPLIT" ? "How was it split? e.g. Cash ₹200 + UPI ₹250" : "Note (optional)"}
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setShowPayConfirm(false)} disabled={paying}>Cancel</Button>
                        <Button className="flex-1 gap-1.5" onClick={handleMarkPaid} disabled={paying}>
                          {paying ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
                          Confirm Paid
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full h-11 gap-1.5"
                      onClick={() => setShowPayConfirm(true)}
                    >
                      <CircleCheck className="size-4" /> Mark as Paid
                    </Button>
                  )}

                  {detail?.status === "AWAITING_PAYMENT" && !showPayConfirm && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full h-11 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleRejectPayment}
                      disabled={rejectingPayment}
                    >
                      {rejectingPayment ? <Loader2 className="size-4 animate-spin" /> : null}
                      {rejectingPayment ? "Rejecting…" : "Reject Payment"}
                    </Button>
                  )}

                  {/* Release Table */}
                  {showReleaseConfirm ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                      <p className="text-sm font-semibold text-destructive">Release Table {table?.tableNumber}?</p>
                      <p className="text-xs text-muted-foreground">This will void all charges and mark the table as available. Use this for abandoned or mis-scanned tables.</p>
                      <Textarea placeholder="Reason (optional)" value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} rows={2} />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setShowReleaseConfirm(false)} disabled={releasing}>Cancel</Button>
                        <Button variant="destructive" className="flex-1 gap-1.5" onClick={handleRelease} disabled={releasing}>
                          {releasing ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4" />}
                          Release Table
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full h-11 gap-1.5 text-muted-foreground"
                      onClick={() => setShowReleaseConfirm(true)}
                    >
                      <DoorOpen className="size-4" /> Release Table (Void)
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>

      {addItemsOpen &&
        createPortal(
          <AddItemsPanel
            currency={currency}
            products={products}
            loadingProducts={loadingProducts}
            catalogLoadedAt={catalogLoadedAt}
            cart={addCart}
            popularProductIds={[]}
            recentlyViewedIds={[]}
            recentSearches={[]}
            onAddToCart={addToAddCart}
            onUpdateQty={updateAddCartQty}
            onCommitSearch={() => {}}
            onClose={closeAddItemsPanel}
          />,
          document.body
        )}
    </Dialog>
  );
}
