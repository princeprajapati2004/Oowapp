import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { buildTableBoard } from "@/lib/services/table-session";

export async function GET() {
  try {
    const session = await requireAdminSession();

    const shop = await db.shop.findUnique({
      where: { id: session.shopId },
      include: { taxes: { where: { isEnabled: true } } },
    });
    if (!shop) throw new Error("Shop not found");

    const configuredTables: string[] = shop.tableNames ? JSON.parse(shop.tableNames) : [];
    const taxes = shop.taxes.map((t) => ({ ...t, value: Number(t.value) }));

    const openSessions = await db.tableSession.findMany({
      where: { shopId: shop.id, status: { in: ["ACTIVE", "AWAITING_PAYMENT"] } },
      include: {
        orders: {
          where: { status: { not: "CANCELLED" } },
          include: { items: { include: { product: { select: { categoryId: true } } } } },
        },
      },
    });

    const board = buildTableBoard(
      configuredTables,
      openSessions.map((s) => ({
        id: s.id,
        tableNumber: s.tableNumber,
        status: s.status,
        createdAt: s.createdAt,
        billRequestedAt: s.billRequestedAt,
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
      taxes
    );

    return NextResponse.json({ enableTableQr: shop.enableTableQr, currency: shop.currency, tables: board });
  } catch (error) {
    return handleApiError(error);
  }
}
