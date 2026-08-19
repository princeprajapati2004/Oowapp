"use client";

import type { ComponentType } from "react";
import {
  Loader2,
  XCircle,
  CheckCircle2,
  CreditCard,
  ChefHat,
  Bell,
  Truck,
  CheckCheck,
  Printer,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { actionButtonBase, orderDetailColors } from "./order-detail-theme";
import type { OrderStatus, PaymentStatus } from "@/lib/order-status";

/**
 * Button copy/color/icon for whichever status a "advance the order" click
 * would move it into — keyed by the TARGET status (not the current one) so
 * both the delivery flow (READY -> OUT_FOR_DELIVERY -> DELIVERED) and the
 * dine-in/takeaway flow (READY -> COMPLETED directly) fall out of the same
 * table without hardcoding a fixed 6-step sequence. The forward step itself
 * (which status is "next") stays owned by getNextStatus() in order-status.ts
 * — this table only decides how that step is presented.
 */
const NEXT_STEP_META: Partial<
  Record<OrderStatus, { label: string; bg: string; icon: ComponentType<{ className?: string }> }>
> = {
  PREPARING: { label: "Start Preparing", bg: orderDetailColors.primaryBlue, icon: ChefHat },
  READY: { label: "Mark Ready", bg: orderDetailColors.purple, icon: Bell },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", bg: orderDetailColors.deliveryOrange, icon: Truck },
  DELIVERED: { label: "Mark Delivered", bg: orderDetailColors.deliveryOrange, icon: Truck },
  COMPLETED: { label: "Mark Complete", bg: orderDetailColors.teal, icon: CheckCheck },
};

const wrapperClassName = "sticky bottom-0 -mx-3 sm:mx-0 flex items-center gap-2.5 border-t bg-background px-3 pt-3 sm:rounded-xl sm:border sm:px-4";
const wrapperStyle = {
  paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
};

export function OrderActionBar({
  status,
  paymentStatus,
  nextStatus,
  busy,
  printing,
  onCancel,
  onConfirm,
  onAdvance,
  onPayment,
  onPrint,
  onShareReceipt,
}: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  nextStatus: OrderStatus | null;
  busy: boolean;
  printing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onAdvance: (next: OrderStatus) => void;
  onPayment: () => void;
  onPrint: () => void;
  onShareReceipt: () => void;
}) {
  if (status === "CANCELLED") {
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        <button
          type="button"
          onClick={onPrint}
          disabled={printing}
          className={cn(actionButtonBase, "text-white")}
          style={{ backgroundColor: orderDetailColors.darkNavy }}
        >
          {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-[18px]" />}
          Print Receipt
        </button>
      </div>
    );
  }

  if (status === "COMPLETED") {
    if (paymentStatus === "PAID") {
      return (
        <div className={wrapperClassName} style={wrapperStyle}>
          <button
            type="button"
            onClick={onPrint}
            disabled={printing}
            className={cn(actionButtonBase, "text-white")}
            style={{ backgroundColor: orderDetailColors.darkNavy }}
          >
            {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-[18px]" />}
            Print Receipt
          </button>
          <button
            type="button"
            onClick={onShareReceipt}
            className={cn(actionButtonBase, "text-white")}
            style={{ backgroundColor: orderDetailColors.whatsappGreen }}
          >
            <MessageCircle className="size-[18px]" />
            Share Receipt
          </button>
        </div>
      );
    }
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        <button
          type="button"
          onClick={onPayment}
          disabled={busy}
          className={cn(actionButtonBase, "text-white")}
          style={{ backgroundColor: orderDetailColors.orange }}
        >
          <CreditCard className="size-[18px]" />
          Add/confirm Payment
        </button>
        <button
          type="button"
          onClick={onPrint}
          disabled={printing}
          className={cn(actionButtonBase, "text-white")}
          style={{ backgroundColor: orderDetailColors.darkNavy }}
        >
          {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-[18px]" />}
          Print Receipt
        </button>
      </div>
    );
  }

  if (status === "PENDING") {
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={cn(actionButtonBase, "text-white")}
          style={{ backgroundColor: orderDetailColors.dangerRed }}
        >
          <XCircle className="size-[18px]" />
          Cancel Order
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={cn(actionButtonBase, "text-white")}
          style={{ backgroundColor: orderDetailColors.successGreen }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-[18px]" />}
          Confirm Order
        </button>
      </div>
    );
  }

  // CONFIRMED / PREPARING / READY / OUT_FOR_DELIVERY / DELIVERED — payment is
  // always offered alongside whatever the forward workflow step is, since
  // payment status is independent of fulfillment status (brief §10).
  const meta = nextStatus ? NEXT_STEP_META[nextStatus] : undefined;
  const AdvanceIcon = meta?.icon;

  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <button
        type="button"
        onClick={onPayment}
        disabled={busy}
        className={cn(actionButtonBase, "text-white")}
        style={{ backgroundColor: orderDetailColors.orange }}
      >
        <CreditCard className="size-[18px]" />
        Add/confirm Payment
      </button>
      {meta && nextStatus && (
        <button
          type="button"
          onClick={() => onAdvance(nextStatus)}
          disabled={busy}
          className={cn(actionButtonBase, "text-white")}
          style={{ backgroundColor: meta.bg }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : AdvanceIcon && <AdvanceIcon className="size-[18px]" />}
          {meta.label}
        </button>
      )}
    </div>
  );
}
