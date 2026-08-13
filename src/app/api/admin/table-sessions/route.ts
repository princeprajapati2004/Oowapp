import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopActor } from "@/lib/shop-actor";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { buildTableBoard } from "@/lib/services/table-session";

export async function GET() {
  try {
    const actor = await requireShopActor();

    const shop = await db.shop.findUnique({
      where: { id: actor.shopId },
      include: { taxes: { where: { isEnabled: true } } },
    });
    if (!shop) throw new Error("Shop not found");

    const configuredTables: string[] = shop.tableNames ? JSON.parse(shop.tableNames) : [];
    const taxes = shop.taxes.map((t) => ({ ...t, value: Number(t.value) }));

    const [openSessions, tableStates] = await Promise.all([
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
        paidAmount: s.paidAmount,
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

    return NextResponse.json({ enableTableQr: shop.enableTableQr, currency: shop.currency, tables: board });
  } catch (error) {
    return handleApiError(error);
  }
}

const setTableStateSchema = z.object({
  tableNumber: z.string().trim().min(1),
  state: z.enum(["RESERVED", "CLEANING", "DISABLED"]).nullable(),
  note: z.string().trim().max(200).optional(),
});

// PATCH sets or clears (state: null) a table's manual state — Reserved,
// Cleaning, or Disabled. Only meaningful for tables with no active session;
// callers are responsible for not offering this on an occupied table.
export async function PATCH(request: Request) {
  try {
    const actor = await requireShopActor("WAITER", "MANAGER");
    const body = await request.json();
    const input = setTableStateSchema.parse(body);

    if (input.state === null) {
      await db.tableState.deleteMany({ where: { shopId: actor.shopId, tableNumber: input.tableNumber } });
      return NextResponse.json({ ok: true });
    }

    const tableState = await db.tableState.upsert({
      where: { shopId_tableNumber: { shopId: actor.shopId, tableNumber: input.tableNumber } },
      create: {
        shopId: actor.shopId,
        tableNumber: input.tableNumber,
        state: input.state,
        note: input.note || null,
        updatedBy: actor.actorId,
      },
      update: {
        state: input.state,
        note: input.note || null,
        updatedBy: actor.actorId,
      },
    });
    return NextResponse.json({ ok: true, tableState });
  } catch (error) {
    return handleApiError(error);
  }
}
