"use client";

import { useState } from "react";
import Image from "next/image";
import { Clock, CircleCheck, ChefHat, PackageCheck, CircleX, MapPin, Hash, StickyNote, ReceiptText } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { useOrderEvents, type OrderEventOrder } from "@/lib/hooks/use-order-events";

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

export function OrderTracker({ order: initialOrder, shop }: { order: OrderEventOrder; shop: Shop }) {
  const [order, setOrder] = useState(initialOrder);

  useOrderEvents(`/api/orders/${initialOrder.id}/stream`, {
    onCreated: (updated) => setOrder(updated),
    onUpdated: (updated) => setOrder(updated),
  });

  const taxBreakdown = (order.taxBreakdown as TaxLine[] | null) ?? [];
  const base = order.subtotal + order.taxTotal;
  const finalTotal = order.discountedTotal ?? base;
  const isCancelled = order.status === "CANCELLED";
  const stepIndex = STEPS.findIndex((s) => s.status === order.status);

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live — updates automatically
          </div>
        </div>

        <div className="rounded-2xl border bg-card overflow-hidden">
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

          {(order.tableNumber || order.deliveryAddress || order.notes) && (
            <div className="px-5 py-3 border-t space-y-1.5 text-sm">
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

          <div className="px-5 py-3 border-t space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">
                  {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span className="font-medium shrink-0">{formatCurrency(item.lineTotal, shop.currency)}</span>
              </div>
            ))}
          </div>

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

        {shop.address || shop.phone ? (
          <p className="text-center text-xs text-muted-foreground">
            {[shop.address, shop.phone].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
