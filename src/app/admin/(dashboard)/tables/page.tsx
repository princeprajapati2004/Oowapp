import { redirect } from "next/navigation";
import { Table2 } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { buildTableBoard } from "@/lib/services/table-session";
import { EmptyState } from "@/components/shared/empty-state";
import { TablesBoard } from "@/components/admin/tables-board";

export default async function TablesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  if (!shop.enableTableQr) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={Table2}
          title="Table QR ordering is off"
          description='Turn on "Table QR ordering" in Settings to use the Tables board.'
        />
      </div>
    );
  }

  const configuredTables: string[] = shop.tableNames ? JSON.parse(shop.tableNames) : [];
  const [taxRows, openSessions, tableStates] = await Promise.all([
    db.tax.findMany({ where: { shopId: shop.id, isEnabled: true } }),
    db.tableSession.findMany({
      where: { shopId: shop.id, status: { in: ["ACTIVE", "AWAITING_PAYMENT"] } },
      include: {
        orders: {
          where: { status: { not: "CANCELLED" } },
          include: { items: { include: { product: { select: { categoryId: true } } } } },
        },
      },
    }),
    db.tableState.findMany({ where: { shopId: shop.id } }),
  ]);
  const taxes = taxRows.map((t) => ({ ...t, value: Number(t.value) }));

  const board = buildTableBoard(
    configuredTables,
    openSessions.map((s) => ({
      id: s.id,
      tableNumber: s.tableNumber,
      status: s.status,
      createdAt: s.createdAt,
      billRequestedAt: s.billRequestedAt,
      customerName: s.customerName,
      guestCount: s.guestCount,
      orders: s.orders.map((o) => ({
        status: o.status,
        items: o.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          categoryId: item.product?.categoryId,
        })),
      })),
    })),
    taxes,
    tableStates.map((s) => ({ tableNumber: s.tableNumber, state: s.state, note: s.note }))
  );

  return <TablesBoard initialTables={board} currency={shop.currency} />;
}
