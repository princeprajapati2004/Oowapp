"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";

interface PurchaseDetailData {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  invoiceNumber: string | null;
  supplier: { id: string; name: string; phone: string };
  subtotal: number;
  taxTotal: number;
  discountAmount: number | null;
  grandTotal: number;
  paidAmount: number;
  paymentStatus: string;
  status: string;
  cancelReason: string | null;
  notes: string | null;
  items: { id: string; productName: string; quantity: number; purchasePrice: number; taxAmount: number | null; lineTotal: number }[];
  payments: { id: string; amount: number; method: string; note: string | null; createdAt: string }[];
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
];

export function PurchaseDetailView({ purchase: initial }: { purchase: PurchaseDetailData }) {
  const router = useRouter();
  const [purchase, setPurchase] = useState(initial);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const outstanding = Math.max(0, purchase.grandTotal - purchase.paidAmount);
  const isCancelled = purchase.status === "CANCELLED";

  async function refresh() {
    const fresh = await api.get<{
      id: string;
      purchaseNumber: string;
      purchaseDate: string;
      invoiceNumber: string | null;
      supplier: { id: string; name: string; phone: string };
      subtotal: string | number;
      taxTotal: string | number;
      discountAmount: string | number | null;
      grandTotal: string | number;
      paidAmount: string | number | null;
      paymentStatus: string;
      status: string;
      cancelReason: string | null;
      notes: string | null;
      items: { id: string; productName: string; quantity: number; purchasePrice: string | number; taxAmount: string | number | null; lineTotal: string | number }[];
      partyPayments: { id: string; amount: string | number; method: string; note: string | null; createdAt: string }[];
    }>(`/api/admin/purchases/${purchase.id}`);
    setPurchase({
      ...fresh,
      subtotal: Number(fresh.subtotal),
      taxTotal: Number(fresh.taxTotal),
      discountAmount: fresh.discountAmount != null ? Number(fresh.discountAmount) : null,
      grandTotal: Number(fresh.grandTotal),
      paidAmount: fresh.paidAmount != null ? Number(fresh.paidAmount) : 0,
      items: fresh.items.map((i) => ({
        id: i.id,
        productName: i.productName,
        quantity: i.quantity,
        purchasePrice: Number(i.purchasePrice),
        taxAmount: i.taxAmount != null ? Number(i.taxAmount) : null,
        lineTotal: Number(i.lineTotal),
      })),
      payments: fresh.partyPayments.map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, note: p.note, createdAt: p.createdAt })),
    });
  }

  async function handleRecordPayment() {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmittingPayment(true);
    try {
      await api.patch(`/api/admin/purchases/${purchase.id}`, { action: "record_payment", amount, method: paymentMethod });
      toast.success("Payment recorded");
      setPaymentAmount("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.patch(`/api/admin/purchases/${purchase.id}`, { action: "cancel" });
      toast.success("Purchase cancelled");
      router.refresh();
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to cancel purchase");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <ReportPageHeader
        title={purchase.purchaseNumber}
        description={new Date(purchase.purchaseDate).toLocaleDateString("en-IN")}
      >
        <Link
          href={`/admin/parties/${purchase.supplier.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Building2 className="size-3.5" /> {purchase.supplier.name}
        </Link>
      </ReportPageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {isCancelled ? (
          <Badge variant="destructive">Cancelled</Badge>
        ) : (
          <Badge variant={purchase.paymentStatus === "PAID" ? "default" : "secondary"}>{purchase.paymentStatus.replace("_", " ")}</Badge>
        )}
        {purchase.invoiceNumber && <span className="text-sm text-muted-foreground">Invoice: {purchase.invoiceNumber}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchase.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.productName}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.purchasePrice)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.taxAmount ?? 0)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.lineTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-1 rounded-lg p-4 ring-1 ring-foreground/10">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(purchase.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tax</span>
          <span>{formatCurrency(purchase.taxTotal)}</span>
        </div>
        {purchase.discountAmount ? (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount</span>
            <span>-{formatCurrency(purchase.discountAmount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-semibold">
          <span>Grand Total</span>
          <span>{formatCurrency(purchase.grandTotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Paid</span>
          <span>{formatCurrency(purchase.paidAmount)}</span>
        </div>
        <div className="flex justify-between text-sm font-medium">
          <span>Outstanding</span>
          <span>{formatCurrency(outstanding)}</span>
        </div>
      </div>

      {purchase.payments.length > 0 && (
        <div className="space-y-2">
          <Label>Payment History</Label>
          <div className="space-y-1.5">
            {purchase.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-foreground/10">
                <span>
                  {p.method} · {new Date(p.createdAt).toLocaleDateString("en-IN")}
                </span>
                <span className="font-medium">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isCancelled && outstanding > 0 && (
        <div className="space-y-2 rounded-lg p-4 ring-1 ring-foreground/10">
          <Label>Record Payment</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="h-10 max-w-[140px]"
            />
            <ReportSelect value={paymentMethod} onValueChange={setPaymentMethod} options={PAYMENT_METHOD_OPTIONS} className="h-10 w-36" />
            <Button className="h-10" disabled={submittingPayment} onClick={handleRecordPayment}>
              {submittingPayment ? "Saving..." : "Record Payment"}
            </Button>
          </div>
        </div>
      )}

      {isCancelled ? (
        purchase.cancelReason && <p className="text-sm text-muted-foreground">Cancelled: {purchase.cancelReason}</p>
      ) : (
        <>
          <Button variant="destructive" size="sm" disabled={cancelling} onClick={() => setCancelDialogOpen(true)}>
            Cancel Purchase
          </Button>
          <ConfirmDialog
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
            title="Cancel this purchase?"
            description="This reverses the stock this purchase added. Already-recorded payments stay on the supplier's ledger."
            confirmLabel="Cancel Purchase"
            destructive
            onConfirm={handleCancel}
          />
        </>
      )}
    </div>
  );
}
