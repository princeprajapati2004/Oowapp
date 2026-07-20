"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Download, Tag, X, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

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
  discountType: string | null;
  discountValue: number | null;
  discountReason: string | null;
  discountedTotal: number | null;
  createdAt: string;
  items: OrderItem[];
};

export type BillShopData = {
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
  enableTableNumber: boolean;
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
}: {
  order: BillOrderData;
  shop: BillShopData;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const taxBreakdown = order.taxBreakdown as TaxLine[];
  const base = order.subtotal + order.taxTotal;
  const finalTotal = order.discountedTotal ?? base;
  const discountAmt = order.discountedTotal !== null ? base - order.discountedTotal : 0;

  function updateOrder(patch: Partial<BillOrderData>) {
    setOrder((prev) => ({ ...prev, ...patch }));
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      const contentW = pageW - margin * 2;
      let y = margin;

      // ─── Logo ───────────────────────────────────────────────────────────────
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
          // Skip logo on error
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

      doc.text(`Bill No: ${order.billNumber}`, leftX, y);
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

        if (shop.upiId) { doc.text(`UPI: ${shop.upiId}`, margin, y); y += 12; }
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
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/orders" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">Bill #{order.billNumber}</h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[order.status as OrderStatus] ?? STATUS_COLORS.PENDING
              )}
            >
              {STATUS_LABELS[order.status as OrderStatus] ?? order.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 shrink-0"
          disabled={downloadingPdf}
          onClick={handleDownloadPdf}
        >
          <Download className="size-4" />
          {downloadingPdf ? "Generating…" : "Download PDF"}
        </Button>
      </div>

      {/* Bill Card */}
      <div className="rounded-2xl border bg-card overflow-hidden">
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
        </div>

        {/* Notes */}
        {order.notes ? (
          <div className="px-5 py-3 border-t text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
            <p className="mt-0.5 text-muted-foreground">{order.notes}</p>
          </div>
        ) : null}
      </div>

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
          </div>
        </div>
      ) : null}

      <Badge variant="secondary" className="text-xs">
        Order ID: {order.id}
      </Badge>
    </div>
  );
}
