import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { BillDetail, type BillOrderData } from "@/components/admin/bill-detail";

export default async function BillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const { created } = await searchParams;
  const shop = await getShopById(session.shopId);

  const order = await db.order.findFirst({
    where: { id, shopId: session.shopId },
    include: { items: true, statusEvents: { orderBy: { changedAt: "asc" } } },
  });
  if (!order) notFound();

  // Serialize Decimal/Date values for RSC → client boundary
  const serializedOrder = {
    ...order,
    subtotal: Number(order.subtotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    discountValue: order.discountValue !== null ? Number(order.discountValue) : null,
    discountedTotal: order.discountedTotal !== null ? Number(order.discountedTotal) : null,
    paidAmount: order.paidAmount !== null ? Number(order.paidAmount) : null,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentStatus ?? "PENDING",
    paymentConfirmedAt: order.paymentConfirmedAt ? order.paymentConfirmedAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    items: order.items.map((item) => ({
      ...item,
      price: Number(item.price),
      lineTotal: Number(item.lineTotal),
    })),
    statusEvents: order.statusEvents.map((e) => ({ status: e.status, changedAt: e.changedAt.toISOString() })),
    taxBreakdown: (Array.isArray(order.taxBreakdown) ? order.taxBreakdown : []) as unknown as BillOrderData["taxBreakdown"],
  };

  const shopAny = shop as unknown as Record<string, unknown>;

  return (
    <BillDetail
      order={serializedOrder}
      justCreated={created === "1"}
      shop={{
        slug: shop.slug,
        businessName: shop.businessName,
        logoUrl: shop.logoUrl,
        address: shop.address,
        phone: shop.phone,
        whatsappNumber: shop.whatsappNumber,
        gstNumber: shop.gstNumber,
        currency: shop.currency,
        upiId: shop.upiId,
        acceptCash: shop.acceptCash,
        bankAccountNumber: shop.bankAccountNumber,
        bankName: shop.bankName,
        bankIfsc: shop.bankIfsc,
        paymentQrImageUrl: shop.paymentQrImageUrl,
        paymentDisplayName: (shopAny.paymentDisplayName as string | null) ?? null,
        enableTableNumber: (shopAny.enableTableNumber as boolean) ?? true,
        enableOrderBarcodeLabels: (shopAny.enableOrderBarcodeLabels as boolean) ?? false,
      }}
    />
  );
}
