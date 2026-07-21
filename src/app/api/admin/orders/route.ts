import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { calculateBill } from "@/lib/services/billing";
import { sendNewOrderNotification } from "@/lib/services/push";
import type { Prisma } from "@/generated/prisma/client";

const orderItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1),
  price: z.number().min(0),
  quantity: z.number().int().positive(),
  categoryId: z.string().default(""),
});

const createManualOrderSchema = z.object({
  customerName: z.string().trim().max(100).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  tableNumber: z.string().trim().max(50).optional(),
  deliveryAddress: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["CASH", "UPI", "CARD", "ONLINE", "PENDING"]).default("CASH"),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.number().positive().max(100_000).optional(),
  discountReason: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = createManualOrderSchema.parse(body);

    const shop = await db.shop.findUnique({
      where: { id: session.shopId },
      include: { taxes: { where: { isEnabled: true } } },
    });
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const billItems = input.items.map((item) => ({
      id: item.productId ?? crypto.randomUUID(),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      categoryId: item.categoryId,
    }));

    const bill = calculateBill(
      billItems,
      shop.taxes.map((t) => ({ ...t, value: Number(t.value) }))
    );

    const billNumber = `${shop.slug.slice(0, 4).toUpperCase()}-${Date.now()}`;

    let discountedTotal: number | null = null;
    if (input.discountType && input.discountValue) {
      const base = bill.grandTotal;
      const discount =
        input.discountType === "PERCENTAGE"
          ? (base * input.discountValue) / 100
          : input.discountValue;
      discountedTotal = Math.max(0, base - discount);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await (db.order as any).create({
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
        paymentMethod: input.paymentMethod,
        source: "manual",
        discountType: input.discountType ?? null,
        discountValue: input.discountValue ?? null,
        discountReason: input.discountReason ?? null,
        discountedTotal,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId ?? null,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            lineTotal: item.price * item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    sendNewOrderNotification(shop.id, {
      billNumber: order.billNumber,
      customerName: input.customerName,
      grandTotal: bill.grandTotal,
      currency: shop.currency,
      orderId: order.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true, orderId: order.id, billNumber: order.billNumber }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
