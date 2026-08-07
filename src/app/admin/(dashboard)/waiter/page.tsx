import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { WaiterKotPanel } from "@/components/admin/waiter-kot-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Table2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function WaiterPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  if (!shop.enableTableQr) {
    return (
      <div className="flex h-[60vh] items-center justify-center px-4">
        <EmptyState
          icon={Table2}
          title="Table QR ordering is off"
          description='Enable "Table QR ordering" in Settings to use the Waiter KOT panel.'
          action={<Button render={<Link href="/admin/settings" />}>Go to Settings</Button>}
        />
      </div>
    );
  }

  const configuredTables: string[] = shop.tableNames ? JSON.parse(shop.tableNames) : [];

  const [products, taxes, openSessionsRaw, kotTickets] = await Promise.all([
    db.product.findMany({
      where: { shopId: shop.id, isAvailable: true, isVisible: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    db.tax.findMany({ where: { shopId: shop.id, isEnabled: true } }),
    db.tableSession.findMany({
      where: { shopId: shop.id, status: { in: ["ACTIVE", "AWAITING_PAYMENT"] } },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).kitchenTicket.findMany({
      where: { shopId: shop.id, status: { not: "CANCELLED" } },
      include: { items: true },
      orderBy: { kotNumber: "asc" },
    }).catch(() => []),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openSessions = openSessionsRaw.map((s: any) => ({
    ...s,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kitchenTickets: (kotTickets as any[]).filter((kt: any) => kt.tableSessionId === s.id),
  }));

  const serializedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    imageUrl: p.imageUrl ?? null,
    categoryId: p.categoryId,
    categoryName: p.category.name,
    isAvailable: p.isAvailable,
    stock: p.stock ?? null,
    foodType: p.foodType,
    offerNote: p.offerNote ?? null,
    unit: p.unit ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  const serializedTaxes = taxes.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    value: Number(t.value),
    appliesTo: t.appliesTo,
    categoryId: t.categoryId ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serializedSessions = (openSessions as any[]).map((s: any) => ({
    id: s.id,
    tableNumber: s.tableNumber,
    status: s.status,
    customerName: s.customerName,
    createdAt: s.createdAt.toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kitchenTickets: s.kitchenTickets.map((kt: any) => ({
      id: kt.id,
      kotNumber: kt.kotNumber,
      status: kt.status,
      notes: kt.notes,
      createdAt: kt.createdAt.toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: kt.items.map((i: any) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        quantity: i.quantity,
        notes: i.notes,
      })),
    })),
  }));

  return (
    <WaiterKotPanel
      configuredTables={configuredTables}
      products={serializedProducts}
      taxes={serializedTaxes}
      initialSessions={serializedSessions}
      currency={shop.currency}
      showImages={shop.showProductImages}
    />
  );
}
