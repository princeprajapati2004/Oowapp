"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import QRCode from "qrcode";
import { ArrowLeft, Download, Tag, X, ReceiptText, QrCode as QrCodeIcon, Printer, Share2, CheckCircle2, PartyPopper, Loader2, Barcode, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { useOrderEvents } from "@/lib/hooks/use-order-events";

type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

type TaxLine = { id: string; name: string; amount: number };

type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
};

export type BillOrderData = {
  id: string;
  billNumber: string;
  tokenNumber?: number | null;
  customerName: string | null;
  customerPhone: string | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  taxBreakdown: TaxLine[];
  status: OrderStatus;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  discountType: string | null;
  discountValue: number | null;
  discountReason: string | null;
  discountedTotal: number | null;
  createdAt: string;
  items: OrderItem[];
};

export type BillShopData = {
  slug?: string;
  businessName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  whatsappNumber: string;
  gstNumber: string | null;
  currency: string;
  upiId: string | null;
  acceptCash: boolean;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankIfsc: string | null;
  paymentQrImageUrl: string | null;
  paymentDisplayName: string | null;
  enableTableNumber: boolean;
  enableOrderBarcodeLabels: boolean;
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING:
    "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400",
  READY:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  COMPLETED: "bg-muted text-muted-foreground border-border",
  CANCELLED:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const BILL_PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI App" },
  { value: "QR", label: "Scan QR" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
] as const;

function MarkPaidSection({
  order,
  currency,
  onMarkedPaid,
}: {
  order: BillOrderData;
  currency: string;
  onMarkedPaid: (method: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [method, setMethod] = useState<(typeof BILL_PAYMENT_METHODS)[number]["value"]>("CASH");
  const [saving, setSaving] = useState(false);
  const isPaid = order.paymentStatus === "PAID" || (!!order.paymentMethod && order.paymentMethod !== "PENDING");
  const finalTotal = order.discountedTotal ?? (order.subtotal + order.taxTotal);

  async function handleConfirm() {
    setSaving(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { action: "mark_paid", paymentMethod: method });
      onMarkedPaid(method);
      setShowForm(false);
      toast.success("Order marked as paid");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to mark as paid");
    } finally {
      setSaving(false);
    }
  }

  if (isPaid) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20 px-4 py-3">
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">
          Paid via {order.paymentMethod ? order.paymentMethod.charAt(0) + order.paymentMethod.slice(1).toLowerCase() : "unknown method"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-1.5">
        <ReceiptText className="size-3.5 text-muted-foreground" />
        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Payment</p>
        <span className="ml-auto text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 font-medium">
          Pending
        </span>
      </div>

      {!showForm ? (
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Amount due: <span className="font-semibold text-foreground">{formatCurrency(finalTotal, currency)}</span>
          </p>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowForm(true)}>
            <CheckCircle2 className="size-3.5" /> Mark as Paid
          </Button>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Amount due</span>
            <span className="font-bold">{formatCurrency(finalTotal, currency)}</span>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How did they pay?</p>
            <div className="flex flex-wrap gap-1.5">
              {BILL_PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    method === m.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1 gap-1.5" onClick={handleConfirm} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirm Paid
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscountSection({
  order,
  currency,
  onDiscountApplied,
}: {
  order: BillOrderData;
  currency: string;
  onDiscountApplied: (updated: Partial<BillOrderData>) => void;
}) {
  const [mode, setMode] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const hasDiscount = !!order.discountType;
  const base = order.subtotal + order.taxTotal;

  async function applyDiscount() {
    const num = parseFloat(value);
    if (!num || num <= 0) {
      toast.error("Enter a valid discount amount");
      return;
    }
    if (mode === "PERCENTAGE" && num > 100) {
      toast.error("Percentage cannot exceed 100%");
      return;
    }
    if (mode === "FIXED" && num > base) {
      toast.error("Discount cannot exceed the order total");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, {
        action: "discount",
        discountType: mode,
        discountValue: num,
        discountReason: reason || undefined,
      });
      const discountAmt =
        mode === "PERCENTAGE" ? (base * num) / 100 : num;
      onDiscountApplied({
        discountType: mode,
        discountValue: num,
        discountReason: reason || null,
        discountedTotal: Math.max(0, base - discountAmt),
      });
      setShowForm(false);
      setValue("");
      setReason("");
      toast.success("Discount applied");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to apply discount");
    } finally {
      setSaving(false);
    }
  }

  async function removeDiscount() {
    setRemoving(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { action: "remove_discount" });
      onDiscountApplied({
        discountType: null,
        discountValue: null,
        discountReason: null,
        discountedTotal: null,
      });
      toast.success("Discount removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove discount");
    } finally {
      setRemoving(false);
    }
  }

  const discountAmt =
    value && parseFloat(value) > 0
      ? mode === "PERCENTAGE"
        ? (base * parseFloat(value)) / 100
        : parseFloat(value)
      : 0;

  const previewTotal = discountAmt > 0 ? Math.max(0, base - discountAmt) : null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-muted-foreground" />
          <p className="font-semibold text-sm">Apply Discount</p>
        </div>
        {hasDiscount && (
          <button
            type="button"
            onClick={removeDiscount}
            disabled={removing}
            className="text-xs text-destructive hover:underline disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        )}
      </div>

      {hasDiscount ? (
        <div className="px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {order.discountType === "PERCENTAGE"
                ? `Discount (${order.discountValue}%)`
                : "Discount (fixed)"}
            </span>
            <span className="font-medium text-emerald-600">
              −{formatCurrency(base - (order.discountedTotal ?? base), currency)}
            </span>
          </div>
          {order.discountReason && (
            <p className="text-xs text-muted-foreground">{order.discountReason}</p>
          )}
          <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
            <span>Final total</span>
            <span className="text-primary">
              {formatCurrency(order.discountedTotal ?? base, currency)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline pt-1"
          >
            Change discount
          </button>
        </div>
      ) : !showForm ? (
        <div className="px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowForm(true)}
          >
            <Tag className="size-3.5" />
            Add discount
          </Button>
        </div>
      ) : null}

      {showForm && (
        <div className="px-4 pb-4 pt-3 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("PERCENTAGE")}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors",
                mode === "PERCENTAGE"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              )}
            >
              Percentage (%)
            </button>
            <button
              type="button"
              onClick={() => setMode("FIXED")}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors",
                mode === "FIXED"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              )}
            >
              Fixed amount
            </button>
          </div>

          <Input
            type="number"
            step="0.01"
            min="0"
            max={mode === "PERCENTAGE" ? "100" : undefined}
            placeholder={mode === "PERCENTAGE" ? "e.g. 10" : "e.g. 150"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9"
          />

          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9"
          />

          {previewTotal !== null && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm border border-emerald-200 dark:border-emerald-800">
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="text-emerald-600 font-medium">
                  −{formatCurrency(discountAmt, currency)}
                </span>
              </div>
              <div className="flex justify-between font-bold mt-1">
                <span>Final total</span>
                <span className="text-primary">{formatCurrency(previewTotal, currency)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9 flex-1"
              disabled={saving}
              onClick={applyDiscount}
            >
              {saving ? "Applying…" : "Apply discount"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => { setShowForm(false); setValue(""); setReason(""); }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BillDetail({
  order: initialOrder,
  shop,
  justCreated,
}: {
  order: BillOrderData;
  shop: BillShopData;
  justCreated?: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [completingOrder, setCompletingOrder] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreatedBanner, setShowCreatedBanner] = useState(!!justCreated);
  const [trackingQr, setTrackingQr] = useState<string | null>(null);

  useEffect(() => {
    if (!shop.slug) return;
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    QRCode.toDataURL(`${base}/order/${shop.slug}/track/${order.id}`, { width: 200, margin: 1 })
      .then(setTrackingQr)
      .catch(() => {});
  }, [shop.slug, order.id]);

  const taxBreakdown = order.taxBreakdown as TaxLine[];
  const base = order.subtotal + order.taxTotal;
  const finalTotal = order.discountedTotal ?? base;
  const discountAmt = order.discountedTotal !== null ? base - order.discountedTotal : 0;

  function updateOrder(patch: Partial<BillOrderData>) {
    setOrder((prev) => ({ ...prev, ...patch }));
  }

  // Neither is a stored field — both are honestly derived from data that
  // already exists: table vs. delivery address tells us the order type the
  // same way create-order-page.tsx captured it, and paymentMethod already
  // doubles as the paid/pending signal (see the header badge below).
  const orderType =
    shop.enableTableNumber && order.tableNumber ? "Dine-in" : order.deliveryAddress ? "Delivery" : "Takeaway";
  const isPaid =
    order.paymentStatus === "PAID" ||
    (!!order.paymentMethod && order.paymentMethod !== "PENDING");

  async function handleCompleteOrder() {
    setCompletingOrder(true);
    try {
      await api.patch(`/api/admin/orders/${order.id}`, { status: "COMPLETED" });
      updateOrder({ status: "COMPLETED" });
      toast.success("Order marked as completed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update order");
    } finally {
      setCompletingOrder(false);
    }
  }

  async function handleShare() {
    const summary = `Invoice ${order.billNumber} — ${shop.businessName}\nTotal: ${formatCurrency(finalTotal, shop.currency)}\nThank you for your business!`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `Invoice ${order.billNumber}`, text: summary });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(summary);
      toast.success("Invoice summary copied to clipboard");
    } catch {
      toast.error("Sharing isn't supported on this browser");
    }
  }

  async function handleDeleteOrder() {
    setDeletingOrder(true);
    try {
      await api.delete(`/api/admin/orders/${order.id}`);
      router.push("/admin/orders");
      toast.success("Order deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete order");
    } finally {
      setDeletingOrder(false);
    }
  }

  useOrderEvents("/api/admin/orders/stream", {
    onUpdated: (updated) => {
      if (updated.id !== order.id) return;
      updateOrder({
        status: updated.status as OrderStatus,
        subtotal: updated.subtotal,
        taxTotal: updated.taxTotal,
        grandTotal: updated.grandTotal,
        discountType: updated.discountType,
        discountValue: updated.discountValue,
        discountReason: updated.discountReason,
        discountedTotal: updated.discountedTotal,
        items: updated.items.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      });
    },
  });

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      const contentW = pageW - margin * 2;
      let y = margin;

      // ─── logo_1 ───────────────────────────────────────────────────────────────
      if (shop.logoUrl) {
        try {
          const resp = await fetch(shop.logoUrl);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const logoSize = 56;
          doc.addImage(dataUrl, "WEBP", (pageW - logoSize) / 2, y, logoSize, logoSize);
          y += logoSize + 10;
        } catch {
          // Skip logo_1 on error
        }
      }

      // ─── Business Header ────────────────────────────────────────────────────
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text(shop.businessName, pageW / 2, y, { align: "center" });
      y += 22;

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      if (shop.address) {
        const addrLines = doc.splitTextToSize(shop.address, contentW * 0.7);
        doc.text(addrLines, pageW / 2, y, { align: "center" });
        y += addrLines.length * 12;
      }
      const contactParts: string[] = [];
      if (shop.phone) contactParts.push(`Tel: ${shop.phone}`);
      if (shop.whatsappNumber && shop.whatsappNumber !== shop.phone) {
        contactParts.push(`WhatsApp: ${shop.whatsappNumber}`);
      }
      if (contactParts.length) {
        doc.text(contactParts.join("  |  "), pageW / 2, y, { align: "center" });
        y += 12;
      }
      if (shop.gstNumber) {
        doc.text(`GSTIN: ${shop.gstNumber}`, pageW / 2, y, { align: "center" });
        y += 12;
      }
      y += 6;

      // ─── INVOICE Title ──────────────────────────────────────────────────────
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("INVOICE", pageW / 2, y, { align: "center" });
      y += 16;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 14;

      // ─── Invoice + Customer info ────────────────────────────────────────────
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);

      const createdAt = new Date(order.createdAt);
      const dateStr = createdAt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const timeStr = createdAt.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Left column: invoice info
      const leftX = margin;
      const rightX = pageW / 2 + 10;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("Invoice Details", leftX, y);
      if (order.customerName || order.customerPhone) {
        doc.text("Customer", rightX, y);
      }
      y += 13;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);

      doc.text(`Bill No: ${order.billNumber}${order.tokenNumber ? ` · Token #${order.tokenNumber}` : ""}`, leftX, y);
      if (order.customerName) doc.text(order.customerName, rightX, y);
      y += 12;

      doc.text(`Date: ${dateStr}`, leftX, y);
      if (order.customerPhone) doc.text(`Ph: ${order.customerPhone}`, rightX, y);
      y += 12;

      doc.text(`Time: ${timeStr}`, leftX, y);
      y += 12;

      doc.setTextColor(20, 20, 20);
      const statusLabel = STATUS_LABELS[order.status as OrderStatus] ?? order.status;
      doc.text(`Status: ${statusLabel}`, leftX, y);
      if (shop.enableTableNumber && order.tableNumber) {
        doc.text(`Table: ${order.tableNumber}`, rightX, y);
      }
      y += 12;
      doc.text(`Order type: ${orderType}`, leftX, y);
      if (order.paymentMethod) {
        doc.text(isPaid ? "Paid" : "Payment pending", rightX, y);
      }
      y += 12;
      if (!shop.enableTableNumber && order.deliveryAddress) {
        doc.text(`Address: ${order.deliveryAddress}`, leftX, y);
        y += 12;
      }
      if (order.notes) {
        doc.setTextColor(100, 100, 100);
        const noteLines = doc.splitTextToSize(`Note: ${order.notes}`, contentW);
        doc.text(noteLines, leftX, y);
        y += noteLines.length * 12;
      }

      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 12;

      // ─── Items Table ────────────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 20);
      const col = {
        item: margin,
        qty: margin + contentW * 0.48,
        price: margin + contentW * 0.62,
        total: pageW - margin,
      };

      doc.text("Item", col.item, y);
      doc.text("Qty", col.qty, y, { align: "center" });
      doc.text("Unit Price", col.price, y, { align: "right" });
      doc.text("Amount", col.total, y, { align: "right" });
      y += 5;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      order.items.forEach((item) => {
        const nameLines = doc.splitTextToSize(item.name, contentW * 0.45);
        const rowH = Math.max(nameLines.length * 12, 14);
        doc.text(nameLines, col.item, y);
        doc.text(String(item.quantity), col.qty, y, { align: "center" });
        doc.text(formatCurrency(item.price, shop.currency), col.price, y, { align: "right" });
        doc.text(formatCurrency(item.lineTotal, shop.currency), col.total, y, { align: "right" });
        y += rowH;
      });

      y += 4;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 12;

      // ─── Totals ──────────────────────────────────────────────────────────────
      const totalLabelX = pageW - margin - 170;
      const totalValueX = pageW - margin;

      function totalRow(label: string, value: string, bold = false, color?: [number, number, number]) {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(bold ? 10 : 8.5);
        if (color) doc.setTextColor(...color);
        else doc.setTextColor(80, 80, 80);
        doc.text(label, totalLabelX, y);
        doc.text(value, totalValueX, y, { align: "right" });
        if (color) doc.setTextColor(80, 80, 80);
        y += bold ? 15 : 13;
      }

      totalRow("Subtotal", formatCurrency(order.subtotal, shop.currency));

      taxBreakdown.forEach((line) => {
        totalRow(line.name, formatCurrency(line.amount, shop.currency));
      });

      if (order.discountType && discountAmt > 0) {
        const discLabel =
          order.discountType === "PERCENTAGE"
            ? `Discount (${order.discountValue}%)`
            : "Discount";
        totalRow(discLabel, `−${formatCurrency(discountAmt, shop.currency)}`, false, [16, 130, 90]);
      }

      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(totalLabelX, y, pageW - margin, y);
      y += 8;

      totalRow("Grand Total", formatCurrency(finalTotal, shop.currency), true, [20, 20, 20]);

      if (order.paymentMethod) {
        totalRow("Amount Paid", formatCurrency(isPaid ? finalTotal : 0, shop.currency));
        if (!isPaid) {
          totalRow("Balance Due", formatCurrency(finalTotal, shop.currency), false, [180, 120, 10]);
        }
      }

      y += 10;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 14;

      // ─── Payment Info ────────────────────────────────────────────────────────
      const hasPayment =
        shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl;
      if (hasPayment) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(20, 20, 20);
        doc.text("Payment Information", margin, y);
        y += 13;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);

        if (shop.upiId) {
          const payeeName = shop.paymentDisplayName || shop.businessName;
          doc.text(`Pay to: ${payeeName}`, margin, y); y += 12;
          doc.text(`UPI: ${shop.upiId}`, margin, y); y += 12;
        }
        if (shop.bankAccountNumber) {
          doc.text(
            `Bank: ${shop.bankName ?? ""} | A/C: ${shop.bankAccountNumber}${shop.bankIfsc ? ` | IFSC: ${shop.bankIfsc}` : ""}`,
            margin,
            y
          );
          y += 12;
        }
        if (shop.acceptCash) { doc.text("Cash accepted", margin, y); y += 12; }

        if (shop.paymentQrImageUrl) {
          try {
            const resp = await fetch(shop.paymentQrImageUrl);
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            const qrSize = 80;
            doc.addImage(dataUrl, "PNG", (pageW - qrSize) / 2, y, qrSize, qrSize);
            y += qrSize + 10;
          } catch {
            // skip
          }
        }

        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageW - margin, y);
        y += 14;
      }

      // ─── Footer ──────────────────────────────────────────────────────────────
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Thank you for your business!", pageW / 2, y, { align: "center" });
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(shop.businessName, pageW / 2, y, { align: "center" });
      if (shop.phone) {
        y += 11;
        doc.text(shop.phone, pageW / 2, y, { align: "center" });
      }

      doc.save(`invoice-${order.billNumber}.pdf`);
      toast.success("Invoice downloaded");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      {showCreatedBanner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 print:hidden dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <PartyPopper className="size-5 shrink-0" />
            <p className="text-sm font-medium">Order created — here&apos;s the invoice to review, print, or share.</p>
          </div>
          <button
            onClick={() => setShowCreatedBanner(false)}
            aria-label="Dismiss"
            className="shrink-0 text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/orders" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">Bill #{order.billNumber}</h1>
            {order.tokenNumber ? (
              <span className="text-sm font-medium text-muted-foreground">Token #{order.tokenNumber}</span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[order.status as OrderStatus] ?? STATUS_COLORS.PENDING
              )}
            >
              {STATUS_LABELS[order.status as OrderStatus] ?? order.status}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                order.paymentMethod === "PENDING"
                  ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}
            >
              {order.paymentMethod === "PENDING"
                ? "Payment pending"
                : order.paymentMethod
                  ? `Paid via ${order.paymentMethod.charAt(0) + order.paymentMethod.slice(1).toLowerCase()}`
                  : "Payment recorded"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        {order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
          <Button size="sm" className="h-9 gap-1.5" disabled={completingOrder} onClick={handleCompleteOrder}>
            <CheckCircle2 className="size-4" />
            {completingOrder ? "Completing…" : "Complete Order"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-9 w-9")} aria-label="More actions">
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => window.print()}>
              <Printer className="size-4" /> Print Bill
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="size-4" /> Share Bill
            </DropdownMenuItem>
            <DropdownMenuItem disabled={downloadingPdf} onClick={handleDownloadPdf}>
              <Download className="size-4" /> Download PDF
            </DropdownMenuItem>
            {shop.enableOrderBarcodeLabels && (
              <DropdownMenuItem render={<a href={`/admin/orders/${order.id}/barcodes`} target="_blank" rel="noopener noreferrer" />}>
                <Barcode className="size-4" /> Print Barcode
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={deletingOrder} onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="size-4" /> Delete Order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Order"
        description="This order will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteOrder}
      />

      {/* Bill Card */}
      <div className="rounded-2xl border bg-card overflow-hidden print:rounded-none print:border-0">
        {/* Business header */}
        <div className="px-5 py-5 text-center border-b bg-muted/30">
          {shop.logoUrl ? (
            <Image
              src={shop.logoUrl}
              alt={shop.businessName}
              width={52}
              height={52}
              unoptimized
              className="mx-auto mb-3 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="mx-auto mb-3 size-[52px] rounded-full bg-primary/10 flex items-center justify-center">
              <ReceiptText className="size-6 text-primary" />
            </div>
          )}
          <p className="font-bold text-lg">{shop.businessName}</p>
          {shop.address ? <p className="text-xs text-muted-foreground mt-0.5">{shop.address}</p> : null}
          {shop.phone ? <p className="text-xs text-muted-foreground">{shop.phone}</p> : null}
          {shop.gstNumber ? (
            <p className="text-xs text-muted-foreground">GSTIN: {shop.gstNumber}</p>
          ) : null}
        </div>

        {/* Invoice / customer details */}
        <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm border-b">
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Invoice</span>
            <p className="font-mono font-medium">{order.billNumber}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Date</span>
            <p className="font-medium">{new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Order type</span>
            <p className="font-medium">{orderType}</p>
          </div>
          {order.customerName ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Customer</span>
              <p className="font-medium">{order.customerName}</p>
            </div>
          ) : null}
          {order.customerPhone ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Phone</span>
              <p className="font-medium">{order.customerPhone}</p>
            </div>
          ) : null}
          {shop.enableTableNumber && order.tableNumber ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Table</span>
              <p className="font-medium">{order.tableNumber}</p>
            </div>
          ) : null}
          {order.deliveryAddress ? (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Address</span>
              <p className="font-medium">{order.deliveryAddress}</p>
            </div>
          ) : null}
        </div>

        {/* Items */}
        <div className="divide-y">
          {order.items.map((item) => (
            <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(item.price, shop.currency)} × {item.quantity}
                </p>
              </div>
              <p className="font-semibold shrink-0">{formatCurrency(item.lineTotal, shop.currency)}</p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="px-5 py-4 space-y-2 border-t bg-muted/20 text-sm">
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
          {order.discountType && discountAmt > 0 ? (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>
                {order.discountType === "PERCENTAGE"
                  ? `Discount (${order.discountValue}%)`
                  : "Discount"}
                {order.discountReason ? ` — ${order.discountReason}` : ""}
              </span>
              <span className="font-medium">−{formatCurrency(discountAmt, shop.currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
            <span>Grand Total</span>
            <span className="text-primary">{formatCurrency(finalTotal, shop.currency)}</span>
          </div>
          {order.paymentMethod ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount paid</span>
                <span>{formatCurrency(isPaid ? finalTotal : 0, shop.currency)}</span>
              </div>
              {!isPaid && (
                <div className="flex justify-between font-medium text-amber-600 dark:text-amber-400">
                  <span>Balance due</span>
                  <span>{formatCurrency(finalTotal, shop.currency)}</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Notes */}
        {order.notes ? (
          <div className="px-5 py-3 border-t text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
            <p className="mt-0.5 text-muted-foreground">{order.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Everything below is editing UI / supplementary info, not part of
          the receipt itself — hidden when printing. */}
      <div className="space-y-6 print:hidden">
      {/* Payment status — only for standalone orders (table sessions manage payment
          at the session level via the Tables board). */}
      {!order.tableNumber && (
        <MarkPaidSection
          order={order}
          currency={shop.currency}
          onMarkedPaid={(method) => updateOrder({ paymentMethod: method, paymentStatus: "PAID" })}
        />
      )}

      {/* Discount Section */}
      <DiscountSection
        order={order}
        currency={shop.currency}
        onDiscountApplied={updateOrder}
      />

      {/* Payment info */}
      {(shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl) ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Payment Methods
            </p>
          </div>
          <div className="px-4 py-3 space-y-2 text-sm">
            {shop.upiId && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">UPI ID</span>
                <span className="font-medium">{shop.upiId}</span>
              </div>
            )}
            {shop.bankAccountNumber && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                <p className="font-medium text-foreground">Bank Transfer</p>
                {shop.bankName && <p className="text-muted-foreground">{shop.bankName}</p>}
                <p className="text-muted-foreground">A/C: {shop.bankAccountNumber}</p>
                {shop.bankIfsc && <p className="text-muted-foreground">IFSC: {shop.bankIfsc}</p>}
              </div>
            )}
            {shop.acceptCash && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span>Cash accepted</span>
              </div>
            )}
            {shop.paymentQrImageUrl && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                <Image
                  src={shop.paymentQrImageUrl}
                  alt="Scan to pay"
                  width={64}
                  height={64}
                  unoptimized
                  className="rounded-md border bg-white object-contain p-1"
                />
                <p className="text-xs text-muted-foreground">Scan to pay via {shop.businessName}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {trackingQr && (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={trackingQr} alt="Order tracking QR code" className="size-16 rounded-md border bg-white p-1" />
          <div className="text-xs text-muted-foreground">
            <p className="flex items-center gap-1 font-medium text-foreground">
              <QrCodeIcon className="size-3.5" /> Scan to track this order live
            </p>
            <p className="mt-0.5">Customers can follow status updates without asking at the counter.</p>
          </div>
        </div>
      )}

      <Badge variant="secondary" className="text-xs">
        Order ID: {order.id}
      </Badge>
      </div>
    </div>
  );
}
