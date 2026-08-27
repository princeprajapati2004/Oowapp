import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getPurchaseDetail } from "@/lib/services/purchase";
import { PurchaseDetailView } from "@/components/admin/purchases/purchase-detail-view";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const purchase = await getPurchaseDetail(session.shopId, id);

  return (
    <PurchaseDetailView
      purchase={{
        id: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        purchaseDate: purchase.purchaseDate.toISOString(),
        invoiceNumber: purchase.invoiceNumber,
        supplier: purchase.supplier,
        subtotal: Number(purchase.subtotal),
        taxTotal: Number(purchase.taxTotal),
        discountAmount: purchase.discountAmount != null ? Number(purchase.discountAmount) : null,
        grandTotal: Number(purchase.grandTotal),
        paidAmount: purchase.paidAmount != null ? Number(purchase.paidAmount) : 0,
        paymentStatus: purchase.paymentStatus,
        status: purchase.status,
        cancelReason: purchase.cancelReason,
        notes: purchase.notes,
        items: purchase.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          purchasePrice: Number(item.purchasePrice),
          taxAmount: item.taxAmount != null ? Number(item.taxAmount) : null,
          lineTotal: Number(item.lineTotal),
        })),
        payments: purchase.partyPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          method: p.method,
          note: p.note,
          createdAt: p.createdAt.toISOString(),
        })),
      }}
    />
  );
}
