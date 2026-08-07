import { formatCurrency } from "@/lib/utils/currency";
import type { BillTotals } from "@/lib/services/billing";

export interface InvoicePdfShop {
  businessName: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  currency: string;
  upiId?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankIfsc?: string | null;
  acceptCash?: boolean;
  paymentQrImageUrl?: string | null;
  paymentDisplayName?: string | null;
}

export interface InvoicePdfItem {
  name: string;
  price: number;
  quantity: number;
}

export interface InvoicePdfInput {
  shop: InvoicePdfShop;
  billNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  tableNumber?: string | null;
  deliveryAddress?: string | null;
  notes?: string | null;
  items: InvoicePdfItem[];
  bill: BillTotals;
  // Optional — used for the "Generate Final Bill" table-session invoice view,
  // which reuses this same PDF generator (current-order-page.tsx / order-tracker.tsx).
  invoiceNumber?: string;
  invoiceDate?: string | Date;
  paymentStatus?: "Paid" | "Unpaid";
  ownerApprovalStatus?: string;
}

async function toDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Single source of truth for the customer-facing invoice PDF — used by both the
 * pre-order bill review (current-order-page.tsx) and the live order/invoice tracker (order-tracker.tsx). */
export async function generateInvoicePdf(input: InvoicePdfInput): Promise<void> {
  const {
    shop,
    billNumber,
    customerName,
    customerPhone,
    tableNumber,
    deliveryAddress,
    notes,
    items,
    bill,
    invoiceNumber,
    invoiceDate,
    paymentStatus,
    ownerApprovalStatus,
  } = input;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 40;

  // logo_1
  if (shop.logoUrl) {
    try {
      const dataUrl = await toDataUrl(shop.logoUrl);
      const imgW = 50;
      doc.addImage(dataUrl, "WEBP", (pageWidth - imgW) / 2, y, imgW, imgW);
      y += 58;
    } catch {
      // logo_1 failed to load — skip it
    }
  }

  // Business header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(shop.businessName, pageWidth / 2, y, { align: "center" });
  y += 20;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  if (shop.address) { doc.text(shop.address, pageWidth / 2, y, { align: "center" }); y += 13; }
  if (shop.phone) { doc.text(shop.phone, pageWidth / 2, y, { align: "center" }); y += 13; }
  y += 6;

  // Divider
  doc.setDrawColor(200);
  doc.line(40, y, pageWidth - 40, y);
  y += 12;

  // Bill info
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.text(`Bill No: ${billNumber}`, 40, y);
  doc.text((invoiceDate ? new Date(invoiceDate) : new Date()).toLocaleString(), pageWidth - 40, y, { align: "right" });
  y += 16;
  if (invoiceNumber) {
    doc.text(`Invoice No: ${invoiceNumber}`, 40, y);
    y += 16;
  }

  // Customer details
  const custFields: string[] = [];
  if (customerName) custFields.push(`Name: ${customerName}`);
  if (customerPhone) custFields.push(`Phone: ${customerPhone}`);
  if (tableNumber) custFields.push(`Table: ${tableNumber}`);
  if (deliveryAddress) custFields.push(`Address: ${deliveryAddress}`);
  if (custFields.length > 0) {
    custFields.forEach((f) => { doc.text(f, 40, y); y += 13; });
    y += 4;
  }

  // Divider
  doc.line(40, y, pageWidth - 40, y);
  y += 12;

  // Items header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Item", 40, y);
  doc.text("Qty", pageWidth / 2 + 20, y, { align: "right" });
  doc.text("Amount", pageWidth - 40, y, { align: "right" });
  y += 4;
  doc.setDrawColor(200);
  doc.line(40, y, pageWidth - 40, y);
  y += 10;
  doc.setFont("helvetica", "normal");

  items.forEach((item) => {
    const lineH = 14;
    const nameLines = doc.splitTextToSize(item.name, pageWidth / 2);
    doc.text(nameLines, 40, y);
    doc.text(`×${item.quantity}`, pageWidth / 2 + 20, y, { align: "right" });
    doc.text(formatCurrency(item.price * item.quantity, shop.currency), pageWidth - 40, y, { align: "right" });
    y += Math.max(nameLines.length * lineH, lineH);
  });

  y += 4;
  doc.line(40, y, pageWidth - 40, y);
  y += 12;

  // Totals
  doc.setFontSize(9);
  doc.text("Subtotal", 40, y);
  doc.text(formatCurrency(bill.subtotal, shop.currency), pageWidth - 40, y, { align: "right" });
  y += 14;

  bill.taxLines.forEach((line) => {
    doc.setTextColor(100);
    doc.text(line.name, 40, y);
    doc.text(formatCurrency(line.amount, shop.currency), pageWidth - 40, y, { align: "right" });
    doc.setTextColor(0);
    y += 14;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Grand Total", 40, y);
  doc.text(formatCurrency(bill.grandTotal, shop.currency), pageWidth - 40, y, { align: "right" });
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  if (paymentStatus || ownerApprovalStatus) {
    if (paymentStatus) {
      doc.text("Payment Status", 40, y);
      doc.text(paymentStatus, pageWidth - 40, y, { align: "right" });
      y += 14;
    }
    if (ownerApprovalStatus) {
      doc.text("Owner Approval Status", 40, y);
      doc.text(ownerApprovalStatus, pageWidth - 40, y, { align: "right" });
      y += 14;
    }
    y += 6;
  }

  // Payment section
  const hasPayment = shop.upiId || shop.bankAccountNumber || shop.acceptCash || shop.paymentQrImageUrl;
  if (hasPayment) {
    doc.line(40, y, pageWidth - 40, y);
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.text("Payment", 40, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    if (shop.upiId) {
      const payeeName = shop.paymentDisplayName || shop.businessName;
      doc.text(`Pay to: ${payeeName}`, 40, y); y += 13;
      doc.text(`UPI ID: ${shop.upiId}`, 40, y); y += 13;
    }
    if (shop.bankAccountNumber) {
      doc.text(`Bank: ${shop.bankName ?? ""} | A/C: ${shop.bankAccountNumber} | IFSC: ${shop.bankIfsc ?? ""}`, 40, y);
      y += 13;
    }
    if (shop.acceptCash) { doc.text("Cash accepted", 40, y); y += 13; }

    if (shop.paymentQrImageUrl) {
      try {
        const dataUrl = await toDataUrl(shop.paymentQrImageUrl);
        const qrSize = 100;
        doc.addImage(dataUrl, "PNG", (pageWidth - qrSize) / 2, y, qrSize, qrSize);
        y += qrSize + 8;
      } catch {
        // QR failed to load — skip
      }
    }
  }

  // Notes
  if (notes) {
    y += 4;
    doc.line(40, y, pageWidth - 40, y);
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 40, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    const noteLines = doc.splitTextToSize(notes, pageWidth - 80);
    doc.text(noteLines, 40, y);
    y += noteLines.length * 13;
    doc.setTextColor(0);
  }

  // Footer
  y += 16;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100);
  doc.text("Thank you for your order!", pageWidth / 2, y, { align: "center" });

  doc.save(`bill-${billNumber}.pdf`);
}
