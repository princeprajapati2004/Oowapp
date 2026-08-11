"use client";

/**
 * Print / Download PDF / Share handlers for an order's bill — a single
 * shared implementation so every place that needs to print/share/export an
 * order's bill calls the exact same, already-working window.print() /
 * jsPDF / Web Share logic instead of duplicating it.
 */
import { useState } from "react";
import { toast } from "sonner";
import { deriveOrderType, STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { formatCurrency } from "@/lib/utils/currency";

export type TaxLine = { id: string; name: string; amount: number };

export type BillOrderItem = {
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
  paidAmount?: number | null;
  transactionReference?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  discountType: string | null;
  discountValue: number | null;
  discountReason: string | null;
  discountedTotal: number | null;
  createdAt: string;
  items: BillOrderItem[];
  statusEvents?: { status: string; changedAt: string }[];
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

export function isOrderPaid(order: Pick<BillOrderData, "paymentStatus" | "paymentMethod">): boolean {
  return (
    order.paymentStatus === "PAID" ||
    (!order.paymentStatus && !!order.paymentMethod && order.paymentMethod !== "PENDING")
  );
}

export function useBillActions(order: BillOrderData, shop: BillShopData) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const taxBreakdown = order.taxBreakdown;
  const base = order.subtotal + order.taxTotal;
  const finalTotal = order.discountedTotal ?? base;
  const discountAmt = order.discountedTotal !== null ? base - order.discountedTotal : 0;
  const orderType = deriveOrderType(order);
  const isPaid = isOrderPaid(order);

  function print() {
    window.print();
  }

  async function share() {
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

  async function downloadPdf() {
    setDownloadingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      const contentW = pageW - margin * 2;
      let y = margin;

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

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("INVOICE", pageW / 2, y, { align: "center" });
      y += 16;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 14;

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);

      const createdAt = new Date(order.createdAt);
      const dateStr = createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

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
      const statusLabel = STATUS_LABELS[order.status] ?? order.status;
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
        const discLabel = order.discountType === "PERCENTAGE" ? `Discount (${order.discountValue}%)` : "Discount";
        totalRow(discLabel, `−${formatCurrency(discountAmt, shop.currency)}`, false, [16, 130, 90]);
      }

      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(totalLabelX, y, pageW - margin, y);
      y += 8;

      totalRow("Grand Total", formatCurrency(finalTotal, shop.currency), true, [20, 20, 20]);

      if (order.paymentMethod) {
        const paidAmount = order.paidAmount ?? (isPaid ? finalTotal : 0);
        totalRow("Amount Paid", formatCurrency(paidAmount, shop.currency));
        if (!isPaid) {
          totalRow("Balance Due", formatCurrency(Math.max(0, finalTotal - paidAmount), shop.currency), false, [180, 120, 10]);
        }
      }

      y += 10;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 14;

      const hasPayment = shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl;
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
          doc.text(`Pay to: ${payeeName}`, margin, y);
          y += 12;
          doc.text(`UPI: ${shop.upiId}`, margin, y);
          y += 12;
        }
        if (shop.bankAccountNumber) {
          doc.text(
            `Bank: ${shop.bankName ?? ""} | A/C: ${shop.bankAccountNumber}${shop.bankIfsc ? ` | IFSC: ${shop.bankIfsc}` : ""}`,
            margin,
            y
          );
          y += 12;
        }
        if (shop.acceptCash) {
          doc.text("Cash accepted", margin, y);
          y += 12;
        }

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

  return { print, share, downloadPdf, downloadingPdf, isPaid, orderType, finalTotal, discountAmt };
}
