import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { mergeSessionItems, computeSessionBill } from "@/lib/services/table-session";
import { SessionBill } from "@/components/admin/session-bill";

export default async function TableSessionBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const shop = await getShopById(session.shopId);

  const tableSession = await db.tableSession.findFirst({
    where: { id, shopId: session.shopId },
    include: {
      orders: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
        include: { items: { include: { product: { select: { categoryId: true } } } } },
      },
    },
  });
  if (!tableSession) notFound();

  const taxes = await db.tax.findMany({ where: { shopId: session.shopId, isEnabled: true } });
  const taxLines = taxes.map((t) => ({ ...t, value: Number(t.value) }));

  const orders = tableSession.orders.map((o) => ({
    status: o.status,
    items: o.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity,
      categoryId: item.product?.categoryId ?? "",
    })),
  }));

  const mergedItems = mergeSessionItems(orders);
  const bill = computeSessionBill(orders, taxLines);

  const shopAny = shop as unknown as Record<string, unknown>;

  return (
    <SessionBill
      session={{
        id: tableSession.id,
        tableNumber: tableSession.tableNumber,
        status: tableSession.status,
        customerName: tableSession.customerName,
        customerPhone: tableSession.customerPhone,
        createdAt: tableSession.createdAt.toISOString(),
        paymentMethod: tableSession.paymentMethod,
      }}
      items={mergedItems}
      bill={bill}
      shop={{
        businessName: shop.businessName,
        logoUrl: shop.logoUrl,
        address: shop.address,
        phone: shop.phone,
        gstNumber: shop.gstNumber,
        currency: shop.currency,
        enableTableNumber: (shopAny.enableTableNumber as boolean) ?? true,
      }}
    />
  );
}
