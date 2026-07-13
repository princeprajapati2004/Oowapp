import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { calculateBill } from "@/lib/services/billing";
import type { Prisma } from "@/generated/prisma/client";

const orderItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  price: z.number(),
  quantity: z.number().int().positive(),
  categoryId: z.string(),
});

const createOrderSchema = z.object({
  shopSlug: z.string(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  tableNumber: z.string().optional(),
  deliveryAddress: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = createOrderSchema.parse(body);

    const shop = await db.shop.findUnique({
      where: { slug: input.shopSlug },
      include: { taxes: { where: { isEnabled: true } } },
    });
    if (!shop || !shop.isPublished) throw new NotFoundError("Shop not found");

    if (!shop.saveOrdersToDb) {
      return NextResponse.json({ ok: true, saved: false });
    }

    const bill = calculateBill(
      input.items.map((item) => ({ ...item, id: item.productId })),
      shop.taxes.map((t) => ({ ...t, value: Number(t.value) }))
    );
    const billNumber = `${shop.slug.slice(0, 4).toUpperCase()}-${Date.now()}`;

    const order = await db.order.create({
      data: {
        shopId: shop.id,
        billNumber,
        customerName: input.customerName || null,
        customerPhone: input.customerPhone || null,
        tableNumber: input.tableNumber || null,
        deliveryAddress: input.deliveryAddress || null,
        notes: input.notes || null,
        subtotal: bill.subtotal,
        taxTotal: bill.taxTotal,
        grandTotal: bill.grandTotal,
        taxBreakdown: bill.taxLines as unknown as Prisma.InputJsonValue,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            lineTotal: item.price * item.quantity,
          })),
        },
      },
    });

    return NextResponse.json({ ok: true, saved: true, orderId: order.id, billNumber: order.billNumber });
  } catch (error) {
    return handleApiError(error);
  }
}
