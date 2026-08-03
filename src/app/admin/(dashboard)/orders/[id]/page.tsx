import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { BillDetail } from "@/components/admin/bill-detail";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = await (db.order as any).findFirst({
    where: { id, shopId: session.shopId },
    include: { items: true },
  });
  if (!order) notFound();

  // Serialize Decimal values for RSC → client boundary
  const serializedOrder = {
    ...order,
    subtotal: Number(order.subtotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    discountValue: order.discountValue !== null ? Number(order.discountValue) : null,
    discountedTotal: order.discountedTotal !== null ? Number(order.discountedTotal) : null,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentStatus ?? "PENDING",
    paymentConfirmedAt: order.paymentConfirmedAt ? order.paymentConfirmedAt.toISOString() : null,
    items: order.items.map((item: { price: unknown; lineTotal: unknown; [key: string]: unknown }) => ({
      ...item,
      price: Number(item.price),
      lineTotal: Number(item.lineTotal),
    })),
    taxBreakdown: Array.isArray(order.taxBreakdown) ? order.taxBreakdown : [],
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
      }}
    />
  );
}
