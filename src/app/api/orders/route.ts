import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { calculateBill } from "@/lib/services/billing";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendNewOrderNotification } from "@/lib/services/push";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import { getCustomerSession } from "@/lib/customer-session";
import { resolveOrCreateSession, computeSessionBill } from "@/lib/services/table-session";
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
  billNumber: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  tableNumber: z.string().optional(),
  deliveryAddress: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
  // Client-generated once per checkout attempt — dedupes retries/double
  // submits (refresh, flaky network, a second WhatsApp send) so they resolve
  // to the same order instead of creating a duplicate.
  clientRequestId: z.string().min(10).max(100),
});

export async function POST(request: Request) {
  try {
    // 10 submissions per IP per minute — blocks naive spam without affecting real customers.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`orders:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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

    // Table sessions are keyed by tableNumber alone, so an unrecognized
    // number (hand-typed when not QR-prefilled) must never be allowed to
    // stand up a session — it would occupy a "table" that doesn't exist and
    // can never be found on the admin board to release.
    if (shop.enableTableQr && input.tableNumber) {
      const configuredTables: string[] = shop.tableNames ? JSON.parse(shop.tableNames) : [];
      if (configuredTables.length > 0 && !configuredTables.includes(input.tableNumber)) {
        return NextResponse.json(
          { error: "This table wasn't recognized — please scan the QR code at your table again." },
          { status: 400 }
        );
      }
    }

    const taxes = shop.taxes.map((t) => ({ ...t, value: Number(t.value) }));

    // Link the order to the account if the customer is logged in — derived
    // from the session cookie server-side, never trusted from client input.
    // A session scoped to a different shop doesn't count here.
    const customerSession = await getCustomerSession();
    const customerId =
      customerSession && customerSession.shopId === shop.id ? customerSession.customerId : null;

    const { order, isDuplicate } = await db.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { shopId_clientRequestId: { shopId: shop.id, clientRequestId: input.clientRequestId } },
        include: { items: true },
      });
      if (existing) {
        return { order: existing, isDuplicate: true };
      }

      // Only QR/table orders participate in table-session grouping — pickup,
      // delivery, and manual orders (or shops with table QR off) are
      // unaffected and behave exactly as before.
      const tableSession =
        shop.enableTableQr && input.tableNumber
          ? await resolveOrCreateSession(tx, {
              shopId: shop.id,
              tableNumber: input.tableNumber,
              customerName: input.customerName,
              customerPhone: input.customerPhone,
              customerId,
            })
          : null;

      // Bill for this round only — the delta being submitted, not the
      // session's cumulative total (see computeSessionBill below).
      const bill = calculateBill(
        input.items.map((item) => ({ ...item, id: item.productId })),
        taxes
      );
      const billNumber = input.billNumber ?? `${shop.slug.slice(0, 4).toUpperCase()}-${Date.now()}`;

      const created = await tx.order.create({
        data: {
          shopId: shop.id,
          billNumber,
          customerId,
          customerName: input.customerName || null,
          customerPhone: input.customerPhone || null,
          tableNumber: input.tableNumber || null,
          deliveryAddress: input.deliveryAddress || null,
          notes: input.notes || null,
          tableSessionId: tableSession?.id ?? null,
          clientRequestId: input.clientRequestId,
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
        include: { items: true },
      });

      return { order: created, isDuplicate: false };
    });

    if (!isDuplicate) {
      // Fire-and-forget push notification — never blocks the response.
      sendNewOrderNotification(shop.id, {
        billNumber: order.billNumber,
        customerName: input.customerName,
        grandTotal: Number(order.grandTotal),
        currency: shop.currency,
        orderId: order.id,
      }).catch(() => {});

      publishOrderEvent(shop.id, { type: "order.created", order: toOrderEvent(order) });
    }

    // When this order is part of a table session, hand the client back the
    // session's cumulative state so it can render "already on this table" /
    // running-total UI without a second round-trip — important for a same
    // sitting second order placed before the page is ever reloaded. The order
    // itself is already committed by this point, so a failure here (e.g. a
    // dropped connection) must not turn an otherwise-successful order into an
    // error response — fall back to the minimal shape instead.
    let sessionOrders:
      | { status: string; items: { productId: string | null; name: string; price: number; quantity: number; categoryId?: string }[] }[]
      | undefined;
    let sessionBill: ReturnType<typeof computeSessionBill> | undefined;
    let sessionStatus: string | null = null;
    if (order.tableSessionId) {
      try {
        const [session, ordersInSession] = await Promise.all([
          db.tableSession.findUnique({ where: { id: order.tableSessionId } }),
          db.order.findMany({
            where: { tableSessionId: order.tableSessionId, status: { not: "CANCELLED" } },
            include: { items: { include: { product: { select: { categoryId: true } } } } },
          }),
        ]);
        sessionStatus = session?.status ?? null;
        sessionOrders = ordersInSession.map((o) => ({
          status: o.status,
          items: o.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: Number(item.price),
            quantity: item.quantity,
            categoryId: item.product?.categoryId,
          })),
        }));
        sessionBill = computeSessionBill(sessionOrders, taxes);
      } catch {
        // Client falls back to its existing local session state — the next
        // successful order or a page reload will resync it.
      }
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      orderId: order.id,
      billNumber: order.billNumber,
      tableSessionId: order.tableSessionId,
      sessionStatus,
      sessionOrders,
      sessionBill,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
