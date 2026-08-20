import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { toAdminOrderEvent } from "@/lib/server/order-events";
import { OrderDetailPage } from "@/components/admin/orders/order-detail-page";

export default async function OrderDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; pay?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const { created, pay } = await searchParams;
  const shop = await getShopById(session.shopId);

  const order = await db.order.findFirst({
    where: { id, shopId: session.shopId },
    include: {
      items: true,
      statusEvents: { orderBy: { changedAt: "asc" } },
      paymentRecords: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();

  const shopAny = shop as unknown as Record<string, unknown>;

  return (
    <OrderDetailPage
      initialOrder={toAdminOrderEvent(order)}
      justCreated={created === "1"}
      openPayment={pay === "1"}
      currency={shop.currency}
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
        printFormat: shop.printFormat,
      }}
    />
  );
}
