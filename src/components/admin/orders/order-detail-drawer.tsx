"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MoreVertical,
  User,
  MapPin,
  Hash,
  ShoppingBag,
  CreditCard,
  Loader2,
  Printer,
  Share2,
  Truck,
  ExternalLink,
  StickyNote,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { useOrderEvents } from "@/lib/hooks/use-order-events";
import { useBillActions, type BillOrderData } from "@/lib/hooks/use-bill-actions";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PAYMENT_LABELS,
  PAYMENT_BADGE_CLASS,
  deriveOrderType,
  deriveOrderSource,
  paymentMethodLabel,
  actionLabel,
  getPrimaryActions,
  type OrderStatus,
  type PaymentStatus,
  type PrimaryAction,
} from "@/lib/order-status";
import type { AdminOrderEventOrder } from "@/lib/server/order-events";
import type { BillShopData } from "@/lib/hooks/use-bill-actions";
import { OrderItemsSummary } from "./order-items-summary";
import { OrderTimeline } from "./order-timeline";
import { OrderConfirmDialog } from "./order-confirm-dialog";
import { OrderCancelDialog } from "./order-cancel-dialog";
import { OrderPaymentModal } from "./order-payment-modal";

const DIRECT_STATUS_ACTIONS: Partial<Record<PrimaryAction, OrderStatus>> = {
  start_processing: "PREPARING",
  mark_ready: "READY",
  out_for_delivery: "OUT_FOR_DELIVERY",
  mark_delivered: "DELIVERED",
  complete: "COMPLETED",
};

function toBillOrderData(order: AdminOrderEventOrder): BillOrderData {
  return {
    id: order.id,
    billNumber: order.billNumber,
    tokenNumber: order.tokenNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    tableNumber: order.tableNumber,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    grandTotal: order.grandTotal,
    taxBreakdown: (order.taxBreakdown as BillOrderData["taxBreakdown"]) ?? [],
    status: order.status as OrderStatus,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paidAmount: order.paidAmount,
    transactionReference: order.transactionReference,
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt,
    discountType: order.discountType,
    discountValue: order.discountValue,
    discountReason: order.discountReason,
    discountedTotal: order.discountedTotal,
    createdAt: order.createdAt,
    items: order.items,
  };
}

export function OrderDetailDrawer({
  orderId,
  onClose,
  shop,
  currency,
  onOrderChanged,
  onFilterByPhone,
}: {
  orderId: string | null;
  onClose: () => void;
  shop: BillShopData;
  currency: string;
  onOrderChanged: (order: AdminOrderEventOrder) => void;
  onFilterByPhone: (phone: string) => void;
}) {
  const [order, setOrder] = useState<AdminOrderEventOrder | null>(null);
  // Derived, not a separate state flag set inside the effect: whenever the
  // requested id doesn't match what's currently loaded, we're loading/stale.
  const loading = !!orderId && order?.id !== orderId;
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    // No id means the drawer is closed (Sheet open={!!orderId}) — its content
    // isn't rendered, so leaving the last-loaded order in state until the
    // next fetch overwrites it is harmless.
    if (!orderId) return;
    let cancelled = false;
    api
      .get<AdminOrderEventOrder>(`/api/admin/orders/${orderId}`)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load this order");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Safe-subset live updates (see order-events.ts) — refetch the full admin
  // shape when this specific order changes elsewhere (kitchen, another tab).
  useOrderEvents("/api/admin/orders/stream", {
    onUpdated: (updated) => {
      if (!orderId || updated.id !== orderId) return;
      api.get<AdminOrderEventOrder>(`/api/admin/orders/${orderId}`).then(setOrder).catch(() => {});
    },
  });

  function applyUpdate(updated: AdminOrderEventOrder) {
    setOrder(updated);
    onOrderChanged(updated);
  }

  async function runStatusAction(action: PrimaryAction) {
    if (!order) return;
    const nextStatus = DIRECT_STATUS_ACTIONS[action];
    if (!nextStatus) return;
    setActionLoading(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "status",
        status: nextStatus,
      });
      applyUpdate(updated);
      toast.success(`Marked as ${STATUS_LABELS[nextStatus]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the order");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveNote() {
    if (!order) return;
    setSavingNote(true);
    try {
      const updated = await api.patch<AdminOrderEventOrder>(`/api/admin/orders/${order.id}`, {
        action: "note",
        ownerNote: noteDraft,
      });
      applyUpdate(updated);
      toast.success("Note saved");
      setNoteOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the note");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <>
      <Sheet open={!!orderId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full p-0 gap-0 data-[side=right]:sm:max-w-md lg:data-[side=right]:max-w-lg flex flex-col">
          {loading || !order ? (
            <div className="p-5 space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : (
            <OrderDetailBody
              order={order}
              currency={currency}
              shop={shop}
              actionLoading={actionLoading}
              onRunStatusAction={runStatusAction}
              onOpenConfirm={() => setConfirmOpen(true)}
              onOpenCancel={() => setCancelOpen(true)}
              onOpenPayment={() => setPaymentOpen(true)}
              onOpenNote={() => {
                setNoteDraft(order.ownerNote ?? "");
                setNoteOpen(true);
              }}
              onFilterByPhone={(phone) => {
                onFilterByPhone(phone);
                onClose();
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {order && (
        <>
          <OrderConfirmDialog
            order={order}
            currency={currency}
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            onConfirmed={applyUpdate}
          />
          <OrderCancelDialog
            order={order}
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            onCancelled={applyUpdate}
          />
          <OrderPaymentModal
            order={order}
            currency={currency}
            shop={shop}
            open={paymentOpen}
            onOpenChange={setPaymentOpen}
            onPaid={applyUpdate}
          />
          <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Owner Note</DialogTitle>
              </DialogHeader>
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Internal note about this order/customer — not visible to the customer."
                className="min-h-24"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setNoteOpen(false)} disabled={savingNote}>
                  Cancel
                </Button>
                <Button onClick={saveNote} disabled={savingNote}>
                  {savingNote ? "Saving…" : "Save Note"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

function OrderDetailBody({
  order,
  currency,
  shop,
  actionLoading,
  onRunStatusAction,
  onOpenConfirm,
  onOpenCancel,
  onOpenPayment,
  onOpenNote,
  onFilterByPhone,
}: {
  order: AdminOrderEventOrder;
  currency: string;
  shop: BillShopData;
  actionLoading: boolean;
  onRunStatusAction: (action: PrimaryAction) => void;
  onOpenConfirm: () => void;
  onOpenCancel: () => void;
  onOpenPayment: () => void;
  onOpenNote: () => void;
  onFilterByPhone: (phone: string) => void;
}) {
  const status = order.status as OrderStatus;
  const paymentStatus = (order.paymentStatus ?? "PENDING") as PaymentStatus;
  const orderType = deriveOrderType(order);
  const actions = getPrimaryActions({ ...order, status });
  const canCancelNow = !["DELIVERED", "COMPLETED", "CANCELLED"].includes(status);
  const billActions = useBillActions(toBillOrderData(order), shop);

  return (
    <div className="flex-1 overflow-y-auto">
      <SheetHeader className="border-b sticky top-0 bg-popover z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <SheetTitle className="font-mono">{order.billNumber}</SheetTitle>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>
        <SheetDescription>
          Placed on {new Date(order.createdAt).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </SheetDescription>
      </SheetHeader>

      <div className="p-4 space-y-4">
        {status === "CANCELLED" && order.cancelReason && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-4 py-3 text-sm">
            <p className="font-medium text-red-700 dark:text-red-400">Cancelled</p>
            <p className="text-red-600/80 dark:text-red-400/80 text-xs mt-0.5">{order.cancelReason}</p>
            {order.cancelledAt && (
              <p className="text-red-600/60 dark:text-red-400/60 text-xs">
                {new Date(order.cancelledAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Customer Details */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
            <User className="size-3.5 text-muted-foreground" />
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground flex-1">
              Customer Details
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                <MoreVertical className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onOpenNote}>
                  <StickyNote className="size-3.5" /> {order.ownerNote ? "Edit Note" : "Add Note"}
                </DropdownMenuItem>
                {order.customerPhone && (
                  <DropdownMenuItem onClick={() => onFilterByPhone(order.customerPhone!)}>
                    <User className="size-3.5" /> View orders from this customer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{order.customerName || "Walk-in Customer"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{order.customerPhone || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Type</span>
              <span className="font-medium">{deriveOrderSource(order)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source</span>
              <span className="font-medium">{orderType}</span>
            </div>
            {order.ownerNote && (
              <div className="pt-1.5 mt-1.5 border-t">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Owner Note</p>
                <p className="text-sm">{order.ownerNote}</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Details */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
            <CreditCard className="size-3.5 text-muted-foreground" />
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Payment Details</p>
          </div>
          <div className="px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PAYMENT_BADGE_CLASS[paymentStatus]}`}>
                {PAYMENT_LABELS[paymentStatus]}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <span className="font-medium">{paymentMethodLabel(order.paymentMethod)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction Reference</span>
              <span className="font-medium font-mono text-xs">{order.transactionReference || "N/A"}</span>
            </div>
            {(paymentStatus === "PENDING" || paymentStatus === "PARTIALLY_PAID") && (
              <div className="flex justify-between border-t pt-1.5 mt-1.5">
                <span className="text-muted-foreground">Amount Due</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {formatCurrency(Math.max(0, (order.discountedTotal ?? order.grandTotal) - (order.paidAmount ?? 0)), currency)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Delivery / Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
            {orderType === "Delivery" ? (
              <Truck className="size-3.5 text-muted-foreground" />
            ) : (
              <Hash className="size-3.5 text-muted-foreground" />
            )}
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              {orderType === "Delivery" ? "Delivery Address" : orderType === "Dine-in" ? "Table" : "Fulfillment"}
            </p>
          </div>
          <div className="px-4 py-3 text-sm">
            {orderType === "Delivery" ? (
              <p className="flex items-start gap-2">
                <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <span>{order.deliveryAddress}</span>
              </p>
            ) : orderType === "Dine-in" ? (
              <p className="font-medium">Table {order.tableNumber}</p>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="size-3.5" /> Takeaway
              </p>
            )}
          </div>
        </div>

        <OrderItemsSummary
          items={order.items}
          subtotal={order.subtotal}
          taxTotal={order.taxTotal}
          taxBreakdown={(order.taxBreakdown as { id: string; name: string; amount: number }[]) ?? []}
          discountType={order.discountType}
          discountValue={order.discountValue}
          discountedTotal={order.discountedTotal}
          discountReason={order.discountReason}
          currency={currency}
        />

        <div id="order-timeline-anchor">
          <OrderTimeline createdAt={order.createdAt} status={status} statusEvents={order.statusEvents} />
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 border-t bg-popover px-4 py-3 flex flex-wrap items-center gap-2">
        {actions.map((action) => {
          if (action === "confirm") {
            return (
              <Button key={action} className="flex-1 min-w-28" disabled={actionLoading} onClick={onOpenConfirm}>
                {actionLabel(action)}
              </Button>
            );
          }
          if (action === "payment") {
            return (
              <Button key={action} variant="outline" className="flex-1 min-w-24 gap-1.5" disabled={actionLoading} onClick={onOpenPayment}>
                <CreditCard className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          if (action === "receipt" || action === "print_bill") {
            return (
              <Button
                key={action}
                variant="outline"
                className="flex-1 min-w-24 gap-1.5"
                render={<Link href={`/admin/orders/${order.id}`} target="_blank" rel="noopener noreferrer" />}
              >
                <Printer className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          if (action === "share_bill") {
            return (
              <Button key={action} variant="outline" className="flex-1 min-w-24 gap-1.5" onClick={billActions.share}>
                <Share2 className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          if (action === "tracking") {
            return (
              <Button
                key={action}
                variant="outline"
                className="flex-1 min-w-24 gap-1.5"
                render={<a href="#order-timeline-anchor" />}
              >
                <ExternalLink className="size-3.5" /> {actionLabel(action)}
              </Button>
            );
          }
          // Direct status-transition actions
          return (
            <Button
              key={action}
              variant="secondary"
              className="flex-1 min-w-28 gap-1.5"
              disabled={actionLoading}
              onClick={() => onRunStatusAction(action)}
            >
              {actionLoading && <Loader2 className="size-3.5 animate-spin" />}
              {actionLabel(action)}
            </Button>
          );
        })}
        {canCancelNow && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onOpenCancel}
          >
            Cancel Order
          </Button>
        )}
      </div>
    </div>
  );
}
