import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { OrderBarcodeLabels } from "@/components/admin/order-barcode-labels";

export default async function OrderBarcodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const shop = await getShopById(session.shopId);

  const order = await db.order.findFirst({
    where: { id, shopId: session.shopId },
    include: { items: true },
  });
  if (!order) notFound();

  return (
    <OrderBarcodeLabels
      billNumber={order.billNumber}
      businessName={shop.businessName}
      items={order.items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity }))}
    />
  );
}
