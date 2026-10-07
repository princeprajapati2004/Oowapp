import { formatCurrency } from "@/lib/utils/currency";

export interface SubscriptionInvoicePdfInput {
  invoiceNumber: string;
  paidAt: Date | string;
  ownerEmail?: string;
  planName: string;
  billingCycle: "MONTHLY" | "ANNUAL";
  baseAmount: number;
  discountAmount: number;
  couponCode?: string | null;
  taxAmount: number;
  totalAmount: number;
  currency: string;
}

/** Client-side, same jsPDF convention as invoice-pdf.ts (dynamic import, manual `y`
 * cursor, helvetica bold/normal, grayscale secondary text) — this is OOWAPP's own
 * subscription receipt, not a shop's customer-facing bill. */
export async function generateSubscriptionInvoicePdf(input: SubscriptionInvoicePdfInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 50;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("OOWAPP", pageWidth / 2, y, { align: "center" });
  y += 18;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("Subscription Receipt", pageWidth / 2, y, { align: "center" });
  y += 20;

  doc.setDrawColor(200);
  doc.line(40, y, pageWidth - 40, y);
  y += 16;

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.text(`Invoice No: ${input.invoiceNumber}`, 40, y);
  doc.text(new Date(input.paidAt).toLocaleString(), pageWidth - 40, y, { align: "right" });
  y += 16;
  if (input.ownerEmail) {
    doc.text(`Billed to: ${input.ownerEmail}`, 40, y);
    y += 20;
  } else {
    y += 4;
  }

  doc.line(40, y, pageWidth - 40, y);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.text("Plan", 40, y);
  doc.text("Amount", pageWidth - 40, y, { align: "right" });
  y += 4;
  doc.line(40, y, pageWidth - 40, y);
  y += 12;
  doc.setFont("helvetica", "normal");

  doc.text(`${input.planName} (${input.billingCycle === "ANNUAL" ? "Annual" : "Monthly"})`, 40, y);
  doc.text(formatCurrency(input.baseAmount, input.currency), pageWidth - 40, y, { align: "right" });
  y += 16;

  if (input.discountAmount > 0) {
    doc.setTextColor(16, 130, 90);
    doc.text(`Discount${input.couponCode ? ` (${input.couponCode})` : ""}`, 40, y);
    doc.text(`-${formatCurrency(input.discountAmount, input.currency)}`, pageWidth - 40, y, { align: "right" });
    doc.setTextColor(0);
    y += 16;
  }

  if (input.taxAmount > 0) {
    doc.setTextColor(100);
    doc.text("Tax (GST)", 40, y);
    doc.text(formatCurrency(input.taxAmount, input.currency), pageWidth - 40, y, { align: "right" });
    doc.setTextColor(0);
    y += 16;
  }

  y += 4;
  doc.line(40, y, pageWidth - 40, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total Paid", 40, y);
  doc.text(formatCurrency(input.totalAmount, input.currency), pageWidth - 40, y, { align: "right" });
  y += 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Payment status: Paid", 40, y);
  y += 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Thank you for subscribing to OOWAPP!", pageWidth / 2, y, { align: "center" });

  doc.save(`${input.invoiceNumber}.pdf`);
}
