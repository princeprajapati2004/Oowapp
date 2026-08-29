import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { calculateBill } from "@/lib/services/billing";
import { requireStaffRole } from "@/lib/staff-session";
import { resolveOrCreateSession } from "@/lib/services/table-session";
import { nextBillNumber } from "@/lib/services/bill-number";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import { sendNewOrderNotification } from "@/lib/services/push";
import { resolveOrderItems } from "@/lib/services/order-items";
import { getOrCreateItemSettings } from "@/lib/services/item-settings";
import { decrementStockForSale } from "@/lib/services/stock";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Prisma } from "@/generated/prisma/client";

const orderItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  price: z.number(),
  quantity: z.number().int().positive(),
  categoryId: z.string(),
});

const createWaiterOrderSchema = z.object({
  tableNumber: z.string().min(1),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
  clientRequestId: z.string().min(10).max(100),
});

export async function POST(request: Request) {
  try {
    const staffSession = await requireStaffRole("WAITER", "MANAGER");

    if (!checkRateLimit(`staff-orders:${staffSession.staffId}`, 20, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = createWaiterOrderSchema.parse(body);

    const shop = await db.shop.findUnique({
      where: { id: staffSession.shopId },
      include: { taxes: { where: { isEnabled: true } } },
    });
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const taxes = shop.taxes.map((t) => ({ ...t, value: Number(t.value) }));

    // Price, name, and category always come from the DB, never the client.
    const [resolvedItems, itemSettings] = await Promise.all([
      resolveOrderItems(shop.id, input.items),
      getOrCreateItemSettings(shop.id),
    ]);
    if (resolvedItems.length === 0) {
      return NextResponse.json({ error: "No valid items in this order." }, { status: 400 });
    }

    const { order, isDuplicate } = await db.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { shopId_clientRequestId: { shopId: shop.id, clientRequestId: input.clientRequestId } },
        include: { items: true },
      });
      if (existing) return { order: existing, isDuplicate: true };

      const tableSession = await resolveOrCreateSession(tx, {
        shopId: shop.id,
        tableNumber: input.tableNumber,
        customerName: input.customerName,
      });

      const bill = calculateBill(
        resolvedItems.map((item) => ({ ...item, id: item.productId })),
        taxes
      );
      const billNumber = await nextBillNumber(tx, shop.id);

      // Decrement stock the same way every other order-creation path does —
      // waiter orders previously skipped this entirely, which meant a
      // product's stock never moved for dine-in orders taken this way.
      await decrementStockForSale(
        tx,
        shop.id,
        resolvedItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        { allowNegativeStock: itemSettings.allowNegativeStock }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (tx.order as any).create({
        data: {
          shopId: shop.id,
          billNumber,
          staffId: staffSession.staffId,
          customerName: input.customerName || null,
          tableNumber: input.tableNumber,
          notes: input.notes || null,
          tableSessionId: tableSession?.id ?? null,
          clientRequestId: input.clientRequestId,
          source: "waiter",
          subtotal: bill.subtotal,
          taxTotal: bill.taxTotal,
          grandTotal: bill.grandTotal,
          taxBreakdown: bill.taxLines as unknown as Prisma.InputJsonValue,
          items: {
            create: resolvedItems.map((item) => ({
              productId: item.productId,
              name: item.name,
              price: item.price,
              costPrice: item.costPrice,
              originalPrice: item.originalPrice,
              offerDiscount: item.offerDiscount,
              quantity: item.quantity,
              lineTotal: item.price * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      return { order: created, isDuplicate: false };
    });

    if (!isDuplicate) {
      sendNewOrderNotification(shop.id, {
        billNumber: order.billNumber,
        customerName: input.customerName,
        grandTotal: Number(order.grandTotal),
        currency: shop.currency,
        orderId: order.id,
      }).catch(() => {});

      publishOrderEvent(shop.id, { type: "order.created", order: toOrderEvent(order) });
    }

    return NextResponse.json({ ok: true, orderId: order.id, billNumber: order.billNumber });
  } catch (error) {
    return handleApiError(error);
  }
}
