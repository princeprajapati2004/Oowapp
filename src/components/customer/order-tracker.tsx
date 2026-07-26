"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Clock,
  CircleCheck,
  ChefHat,
  PackageCheck,
  CircleX,
  MapPin,
  Hash,
  StickyNote,
  ReceiptText,
  Ban,
  User,
  Printer,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QtyStepper } from "@/components/shared/qty-stepper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api-client";
import { useOrderEvents, type OrderEventOrder, type TableSessionEventPayload } from "@/lib/hooks/use-order-events";
import type { BillTotals } from "@/lib/services/billing";

type TaxLine = { id: string; name: string; amount: number };

type Shop = {
  businessName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
};

const STEPS = [
  { status: "PENDING", label: "Order placed", icon: Clock },
  { status: "CONFIRMED", label: "Confirmed", icon: CircleCheck },
  { status: "PREPARING", label: "Preparing", icon: ChefHat },
  { status: "READY", label: "Ready", icon: PackageCheck },
  { status: "COMPLETED", label: "Completed", icon: CircleCheck },
] as const;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Order placed",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// Only orders the kitchen hasn't acted on yet can be self-edited or
// self-cancelled — mirrors the same gate enforced server-side.
const EDITABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

const QUANTITY_DEBOUNCE_MS = 500;

export function OrderTracker({
  order: initialOrder,
  shop,
  session: initialSession,
  sessionBill: initialSessionBill,
}: {
  order: OrderEventOrder;
  shop: Shop;
  session?: TableSessionEventPayload | null;
  sessionBill?: BillTotals | null;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [displayItems, setDisplayItems] = useState(initialOrder.items);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [session, setSession] = useState(initialSession ?? null);
  const [sessionBill, setSessionBill] = useState(initialSessionBill ?? null);
  const [requestingBill, setRequestingBill] = useState(false);

  const pendingChangesRef = useRef<Map<string, number>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});

  useOrderEvents(`/api/orders/${initialOrder.id}/stream`, {
    onCreated: (updated) => {
      setOrder(updated);
      setDisplayItems(updated.items);
    },
    onUpdated: (updated) => {
      setOrder(updated);
      setDisplayItems(updated.items);
    },
  });

  const sessionId = session?.id ?? null;
  useOrderEvents(sessionId ? `/api/table-sessions/${sessionId}/stream` : "", {
    onSessionUpdated: (updated) => setSession(updated),
    onUpdated: () => {
      // An order in this session changed (e.g. quantity added, status moved) —
      // re-fetch the session's cumulative bill rather than trying to
      // reconstruct it from a single event.
      if (!sessionId) return;
      api
        .get<{ bill: BillTotals }>(`/api/table-sessions/${sessionId}`)
        .then((res) => setSessionBill(res.bill))
        .catch(() => {});
    },
  });

  const isTableOrder = !!order.tableSessionId;
  const isEditable = EDITABLE_STATUSES.has(order.status);

  async function flushQuantityChanges() {
    const changes = Array.from(pendingChangesRef.current.entries()).map(([itemId, quantity]) => ({
      itemId,
      quantity,
    }));
    pendingChangesRef.current.clear();
    if (changes.length === 0) return;

    try {
      const res = await api.patch<{ ok: boolean; order: OrderEventOrder }>(`/api/orders/${order.id}`, {
        action: "update_items",
        items: changes,
      });
      setOrder(res.order);
      setDisplayItems(res.order.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update quantity");
      setDisplayItems(order.items); // revert to last confirmed state
    }
  }

  // Reassigned every render (in an effect, not during render) so the debounce
  // timer — scheduled from a possibly-earlier render — always calls the
  // freshest closure instead of one holding stale `order`/`displayItems`.
  useEffect(() => {
    flushRef.current = flushQuantityChanges;
  });

  function handleQuantityChange(itemId: string, quantity: number) {
    setDisplayItems((prev) =>
      quantity <= 0
        ? prev.filter((item) => item.id !== itemId)
        : prev.map((item) => (item.id === itemId ? { ...item, quantity } : item))
    );
    pendingChangesRef.current.set(itemId, quantity);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => flushRef.current(), QUANTITY_DEBOUNCE_MS);
  }

  async function handleConfirmOrder() {
    setConfirming(true);
    try {
      const res = await api.patch<{ ok: boolean; order: OrderEventOrder }>(`/api/orders/${order.id}`, {
        action: "confirm",
      });
      setOrder(res.order);
      setDisplayItems(res.order.items);
      toast.success("Order confirmed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't confirm the order");
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancelOrder() {
    setCancelling(true);
    try {
      const res = await api.patch<{ ok: boolean; order: OrderEventOrder }>(`/api/orders/${order.id}`, {
        action: "cancel",
      });
      setOrder(res.order);
      setDisplayItems(res.order.items);
      toast.success("Order cancelled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel the order");
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  }

  async function handleRequestBill() {
    if (!sessionId) return;
    setRequestingBill(true);
    try {
      const res = await api.patch<{ ok: boolean; session: TableSessionEventPayload }>(
        `/api/table-sessions/${sessionId}`,
        { action: "request_bill" }
      );
      setSession(res.session);
      toast.success("Bill requested — staff has been notified.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't request the bill");
    } finally {
      setRequestingBill(false);
    }
  }

  const taxBreakdown = (order.taxBreakdown as TaxLine[] | null) ?? [];
  const base = order.subtotal + order.taxTotal;
  const finalTotal = order.discountedTotal ?? base;
  const isCancelled = order.status === "CANCELLED";
  const stepIndex = STEPS.findIndex((s) => s.status === order.status);
  // A "bill" implies a settled order — once confirmed, show the bill-specific
  // fields (customer name, payment status, thank-you, print) alongside the
  // still-live status stepper, rather than replacing it.
  const isConfirmedOrLater = !isCancelled && order.status !== "PENDING";
  const isPaid = session ? session.status === "PAID" : order.status === "COMPLETED";

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {shop.logoUrl ? (
            <Image
              src={shop.logoUrl}
              alt={shop.businessName}
              width={48}
              height={48}
              unoptimized
              className="rounded-full object-cover ring-2 ring-background shadow-sm"
            />
          ) : null}
          <p className="font-bold text-lg">{shop.businessName}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground print:hidden">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live — updates automatically
          </div>
        </div>

        <div className="rounded-2xl border bg-card overflow-hidden print:border-0 print:shadow-none">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Bill No.</p>
              <p className="font-mono font-semibold text-sm">{order.billNumber}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(order.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div className="px-5 py-5">
            {isCancelled ? (
              <div className="flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
                <CircleX className="size-6 text-red-600 dark:text-red-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-red-700 dark:text-red-400">Order cancelled</p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80">
                    Contact the business if you weren&apos;t expecting this.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const done = i < stepIndex;
                  const active = i === stepIndex;
                  return (
                    <div key={step.status} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                      <div className="flex w-full items-center">
                        <div
                          className={cn(
                            "flex-1 h-0.5",
                            i === 0 ? "invisible" : done || active ? "bg-primary" : "bg-muted"
                          )}
                        />
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            done
                              ? "bg-primary border-primary text-primary-foreground"
                              : active
                                ? "border-primary text-primary bg-primary/10"
                                : "border-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div
                          className={cn(
                            "flex-1 h-0.5",
                            i === STEPS.length - 1 ? "invisible" : done ? "bg-primary" : "bg-muted"
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[11px] leading-tight",
                          active ? "font-semibold text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t bg-muted/20">
            <span
              data-testid="order-status-badge"
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                isCancelled
                  ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-primary/10 text-primary border-primary/20"
              )}
            >
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>

          {(order.customerName || order.tableNumber || order.deliveryAddress || order.notes) && (
            <div className="px-5 py-3 border-t space-y-1.5 text-sm">
              {order.customerName && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="size-3.5 shrink-0" />
                  <span>{order.customerName}</span>
                </div>
              )}
              {order.tableNumber && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Hash className="size-3.5 shrink-0" />
                  <span>Table {order.tableNumber}</span>
                </div>
              )}
              {order.deliveryAddress && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  <span>{order.deliveryAddress}</span>
                </div>
              )}
              {order.notes && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <StickyNote className="size-3.5 shrink-0" />
                  <span>{order.notes}</span>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-3 border-t space-y-2.5">
            {displayItems.map((item) => {
              const isOnlyItem = displayItems.length === 1;
              // Table orders are permanent once submitted — the stepper can
              // only go up from here, never down or to zero (no remove).
              const min = isTableOrder ? item.quantity : isOnlyItem ? 1 : 0;
              return (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">{item.name}</span>
                  {isEditable ? (
                    <>
                      <span className="print:hidden">
                        <QtyStepper
                          size="sm"
                          value={item.quantity}
                          min={min}
                          max={100_000}
                          onChange={(q) => handleQuantityChange(item.id, q)}
                        />
                      </span>
                      <span className="hidden print:inline text-muted-foreground shrink-0">× {item.quantity}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground shrink-0">× {item.quantity}</span>
                  )}
                  <span className="font-medium shrink-0 w-16 text-right">
                    {formatCurrency(item.price * item.quantity, shop.currency)}
                  </span>
                </div>
              );
            })}
          </div>

          {session && sessionBill && (
            <div className="px-5 py-3 border-t bg-primary/5 flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-1.5">
                <Receipt className="size-3.5 text-primary" /> Table running total
              </span>
              <span className="font-bold text-primary">{formatCurrency(sessionBill.grandTotal, shop.currency)}</span>
            </div>
          )}

          <div className="px-5 py-4 border-t bg-muted/20 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal, shop.currency)}</span>
            </div>
            {taxBreakdown.map((line) => (
              <div key={line.id} className="flex justify-between text-muted-foreground">
                <span>{line.name}</span>
                <span>{formatCurrency(line.amount, shop.currency)}</span>
              </div>
            ))}
            {order.discountType && order.discountedTotal !== null && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount{order.discountReason ? ` — ${order.discountReason}` : ""}</span>
                <span>−{formatCurrency(base - order.discountedTotal, shop.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
              <span className="flex items-center gap-1.5">
                <ReceiptText className="size-4 text-primary" /> Grand total
              </span>
              <span className="text-primary">{formatCurrency(finalTotal, shop.currency)}</span>
            </div>
          </div>
        </div>

        {isConfirmedOrLater && (
          <div className="rounded-2xl border bg-card overflow-hidden print:border-0 print:shadow-none">
            <div className="px-5 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Payment status</span>
              <span className={cn("font-semibold", isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                {isPaid ? "Paid" : "Unpaid"}
              </span>
            </div>
            <div className="px-5 py-4 border-t text-center">
              <p className="text-sm font-medium">Thank you for your order!</p>
              <p className="text-xs text-muted-foreground mt-0.5">We hope to see you again soon.</p>
            </div>
            <div className="px-5 pb-4 print:hidden">
              <Button variant="outline" className="h-9 w-full gap-1.5" onClick={() => window.print()}>
                <Printer className="size-4" /> Print bill
              </Button>
            </div>
          </div>
        )}

        {isEditable && (
          <div className="flex gap-2 print:hidden">
            {order.status === "PENDING" && (
              <Button className="h-10 flex-1 gap-1.5" disabled={confirming} onClick={handleConfirmOrder}>
                <CircleCheck className="size-4" /> {confirming ? "Confirming…" : "Confirm order"}
              </Button>
            )}
            {/* Self-cancelling a submitted table round would defeat "items can
                never be removed" — staff can still correct it via the admin
                order actions if needed. */}
            {!isTableOrder && (
              <Button
                variant="outline"
                className="h-10 flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setCancelOpen(true)}
              >
                <Ban className="size-4" /> Cancel order
              </Button>
            )}
          </div>
        )}

        {session && session.status === "ACTIVE" && (
          <Button
            variant="outline"
            className="h-10 w-full gap-1.5 print:hidden"
            disabled={requestingBill}
            onClick={handleRequestBill}
          >
            <Receipt className="size-4" /> {requestingBill ? "Requesting…" : "Request bill"}
          </Button>
        )}

        {session && session.status === "AWAITING_PAYMENT" && (
          <p className="text-center text-xs text-muted-foreground print:hidden">
            Bill requested — staff has been notified.
          </p>
        )}

        {shop.address || shop.phone ? (
          <p className="text-center text-xs text-muted-foreground">
            {[shop.address, shop.phone].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="This can't be undone. The business will be notified immediately."
        confirmLabel={cancelling ? "Cancelling…" : "Yes, cancel it"}
        destructive
        onConfirm={handleCancelOrder}
      />
    </div>
  );
}
