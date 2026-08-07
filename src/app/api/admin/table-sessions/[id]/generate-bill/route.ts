import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { calculateBill } from "@/lib/services/billing";
import { nextBillNumber } from "@/lib/services/bill-number";
import { publishOrderEvent, toOrderEvent, toTableSessionEvent } from "@/lib/server/order-events";
import { createNotification } from "@/lib/services/notification";
import { formatCurrency } from "@/lib/utils/currency";
import type { Prisma } from "@/generated/prisma/client";

const schema = z.object({
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.number().positive().max(100_000).optional(),
  discountReason: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(300).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = schema.parse(body);

    const tableSession = await db.tableSession.findFirst({
      where: { id, shopId: session.shopId },
    });
    if (!tableSession) throw new NotFoundError("Table session not found");

    if (tableSession.status === "PAID" || tableSession.status === "MERGED") {
      return NextResponse.json({ error: "This table session is already closed." }, { status: 409 });
    }

    // Check if a final bill order already exists for this session
    const existingBill = await db.order.findFirst({
      where: { tableSessionId: id, shopId: session.shopId },
    });
    if (existingBill) {
      return NextResponse.json(
        { error: "A bill has already been generated for this session.", orderId: existingBill.id, billNumber: existingBill.billNumber },
        { status: 409 }
      );
    }

    // Aggregate all non-cancelled KOT items for this session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kitchenTickets = await (db as any).kitchenTicket.findMany({
      where: { tableSessionId: id, status: { not: "CANCELLED" } },
      include: { items: true },
    });

    if (kitchenTickets.length === 0) {
      return NextResponse.json(
        { error: "No items have been sent to the kitchen yet. Add items before generating the bill." },
        { status: 400 }
      );
    }

    const allItems = kitchenTickets.flatMap((ticket) =>
      ticket.items.map((item) => ({
        id: item.productId ?? item.id,
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity,
        categoryId: "",
      }))
    );

    // Merge duplicate products into single lines
    const mergedItems = mergeItems(allItems);

    const shop = await db.shop.findUnique({
      where: { id: session.shopId },
      include: { taxes: { where: { isEnabled: true } } },
    });
    if (!shop) throw new NotFoundError("Shop not found");

    const taxes = shop.taxes.map((t) => ({ ...t, value: Number(t.value) }));
    const bill = calculateBill(mergedItems, taxes);

    let discountedTotal: number | null = null;
    if (input.discountType && input.discountValue) {
      const base = bill.grandTotal;
      const discount =
        input.discountType === "PERCENTAGE"
          ? (base * input.discountValue) / 100
          : input.discountValue;
      discountedTotal = Math.max(0, base - discount);
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const tokenNumber =
      (await db.order.count({ where: { shopId: session.shopId, createdAt: { gte: startOfToday } } })) + 1;

    const order = await db.$transaction(async (tx) => {
      const billNumber = await nextBillNumber(tx, session.shopId);
      const updated = await tx.tableSession.update({
        where: { id },
        data: { status: "AWAITING_PAYMENT", billRequestedAt: new Date() },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (tx.order as any).create({
        data: {
          shopId: session.shopId,
          billNumber,
          tokenNumber,
          tableNumber: tableSession.tableNumber,
          tableSessionId: id,
          customerName: tableSession.customerName ?? null,
          customerPhone: tableSession.customerPhone ?? null,
          notes: input.notes ?? null,
          subtotal: bill.subtotal,
          taxTotal: bill.taxTotal,
          grandTotal: bill.grandTotal,
          taxBreakdown: bill.taxLines as unknown as Prisma.InputJsonValue,
          paymentMethod: "PENDING",
          source: "waiter",
          discountType: input.discountType ?? null,
          discountValue: input.discountValue ?? null,
          discountReason: input.discountReason ?? null,
          discountedTotal,
          items: {
            create: mergedItems.map((item) => ({
              productId: item.id !== item.name ? item.id : null,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              lineTotal: item.price * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      publishOrderEvent(session.shopId, { type: "session.updated", session: toTableSessionEvent(updated) });

      return created;
    });

    publishOrderEvent(session.shopId, { type: "order.created", order: toOrderEvent(order) });

    createNotification(session.shopId, {
      type: "BILL_REQUESTED",
      title: `Table ${tableSession.tableNumber} — Bill requested`,
      body: `${formatCurrency(discountedTotal ?? bill.grandTotal, shop.currency)} total · ${mergedItems.length} item${mergedItems.length === 1 ? "" : "s"}`,
      link: `/admin/orders/${order.id}`,
    }).catch(() => {});

    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        billNumber: order.billNumber,
        grandTotal: discountedTotal ?? bill.grandTotal,
        subtotal: bill.subtotal,
        taxTotal: bill.taxTotal,
        discountedTotal,
        itemCount: mergedItems.length,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

type Item = { id: string; name: string; price: number; quantity: number; categoryId: string };

function mergeItems(items: Item[]): Item[] {
  const map = new Map<string, Item>();
  for (const item of items) {
    const key = `${item.id}::${item.price}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}
