import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError, WalletError } from "@/lib/api-utils";
import { calculateBill } from "@/lib/services/billing";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendNewOrderNotification } from "@/lib/services/push";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import { getCustomerSession } from "@/lib/customer-session";
import { readPhoneVerifiedCookie } from "@/lib/phone-verify-auth";
import { resolveOrCreateSession, computeSessionBill } from "@/lib/services/table-session";
import { resolveOrderItems } from "@/lib/services/order-items";
import { computeCouponForOrder, claimCouponForOrder } from "@/lib/services/coupon";
import { computeCashbackForOrder, claimCashbackForOrder } from "@/lib/services/cashback-campaign";
import { processOrderPaidRewards } from "@/lib/services/rewards";
import { debitWalletForRedemption } from "@/lib/services/wallet";
import { nextBillNumber } from "@/lib/services/bill-number";
import { findOrCreatePartyForOrder } from "@/lib/services/party";
import { createNotification } from "@/lib/services/notification";
import { formatCurrency } from "@/lib/utils/currency";
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
  // Client-generated once per checkout attempt — dedupes retries/double
  // submits (refresh, flaky network, a second WhatsApp send) so they resolve
  // to the same order instead of creating a duplicate.
  clientRequestId: z.string().min(10).max(100),
  couponCode: z.string().trim().min(1).optional(),
  walletAmountUsed: z.number().min(0).optional(),
  cashbackCode: z.string().trim().min(1).optional(),
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

    // DIRECT mode always saves orders to the DB — saveOrdersToDb is only a
    // logging override in WHATSAPP mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderMode: string = (shop as any).orderMode ?? "WHATSAPP";
    if (!shop.saveOrdersToDb && orderMode !== "DIRECT") {
      return NextResponse.json({ ok: true, saved: false });
    }

    // The UI already blocks getting this far without a verified phone (see
    // phone-verification.tsx) — this is the server-side backstop against a
    // direct API call skipping that check entirely.
    if (shop.requirePhone) {
      const verifiedPhone = await readPhoneVerifiedCookie();
      if (
        !verifiedPhone ||
        verifiedPhone.shopId !== shop.id ||
        verifiedPhone.phone !== input.customerPhone
      ) {
        return NextResponse.json(
          { error: "Please verify your phone number before placing an order." },
          { status: 400 }
        );
      }
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

    // Price, name, and category always come from the DB, never the client —
    // only productId/quantity from the request are trusted.
    const resolvedItems = await resolveOrderItems(shop.id, input.items);
    if (resolvedItems.length === 0) {
      return NextResponse.json({ error: "No valid items in this order." }, { status: 400 });
    }

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
        resolvedItems.map((item) => ({ ...item, id: item.productId })),
        taxes
      );
      const billNumber = await nextBillNumber(tx, shop.id);

      // Coupon validated + its discount computed before the order exists (the
      // atomic usage claim needs a real orderId, so it happens after
      // tx.order.create below — see computeCouponForOrder's doc comment).
      const couponResult = input.couponCode
        ? await computeCouponForOrder(tx, shop.id, input.couponCode, resolvedItems, customerId)
        : null;
      const discountedTotal = couponResult
        ? Math.max(0, Math.round((bill.grandTotal - couponResult.discountAmount) * 100) / 100)
        : null;

      // Cashback validated the same way — full price is still charged (no
      // effect on discountedTotal); the reward only lands in the wallet once
      // the order is actually paid (see claimCashbackForOrder below and
      // rewards.ts#processOrderPaidRewards).
      const cashbackResult = input.cashbackCode
        ? await computeCashbackForOrder(tx, shop.id, input.cashbackCode, resolvedItems, customerId)
        : null;

      // Wallet redemption — clamped to what's actually owed on THIS order
      // (not any wider table-session running total), and only ever for a
      // logged-in customer since a guest has no wallet to debit.
      const finalTotal = discountedTotal ?? bill.grandTotal;
      const walletAmountRequested = input.walletAmountUsed ?? 0;
      let walletAmountUsed = 0;
      if (walletAmountRequested > 0) {
        if (!customerId) throw new WalletError("Please log in to use your wallet balance");
        walletAmountUsed = Math.min(Math.round(walletAmountRequested * 100) / 100, finalTotal);
      }

      // Decrement stock for products that track it (fire-and-forget errors — order still succeeds)
      await Promise.all(
        resolvedItems.map((item) =>
          tx.product.updateMany({
            where: { id: item.productId, shopId: shop.id, stock: { gt: 0 } },
            data: { stock: { decrement: item.quantity } },
          })
        )
      );

      // Every order (guest or logged-in) rolls up into the owner's Parties
      // khatabook — find-or-create by phone, same as this app's existing
      // "phone is the identity" convention (see the function's own doc comment).
      const partyId = await findOrCreatePartyForOrder(tx, shop.id, input.customerName, input.customerPhone);

      const created = await tx.order.create({
        data: {
          shopId: shop.id,
          billNumber,
          customerId,
          partyId,
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
          ...(couponResult
            ? {
                couponId: couponResult.couponId,
                couponCode: couponResult.code,
                couponDiscountAmount: couponResult.discountAmount,
                // Dual-write into the pre-existing staff-manual-discount
                // columns too, so every screen already reading
                // order.discountedTotal shows this with no changes — see the
                // Coupon model's doc comment in schema.prisma.
                discountType: "COUPON",
                discountValue: couponResult.discountAmount,
                discountReason: `Coupon: ${couponResult.code}`,
                discountedTotal,
              }
            : {}),
          ...(walletAmountUsed > 0
            ? {
                walletAmountUsed,
                paidAmount: walletAmountUsed,
                paymentMethod: "WALLET",
                paymentStatus: walletAmountUsed + 0.005 >= finalTotal ? "PAID" : "PARTIALLY_PAID",
                paymentConfirmedBy: "wallet",
                paymentConfirmedAt: new Date(),
              }
            : {}),
          ...(cashbackResult
            ? {
                cashbackCampaignId: cashbackResult.campaignId,
                cashbackCode: cashbackResult.code,
                cashbackAmount: cashbackResult.cashbackAmount,
              }
            : {}),
          items: {
            create: resolvedItems.map((item) => ({
              productId: item.productId,
              name: item.name,
              price: item.price,
              costPrice: item.costPrice,
              quantity: item.quantity,
              lineTotal: item.price * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      if (couponResult) {
        await claimCouponForOrder(tx, shop.id, couponResult.couponId, customerId, created.id, couponResult.discountAmount);
      }

      if (cashbackResult) {
        await claimCashbackForOrder(tx, shop.id, cashbackResult.campaignId, customerId!, created.id, cashbackResult.cashbackAmount);
      }

      if (walletAmountUsed > 0) {
        await debitWalletForRedemption(tx, { shopId: shop.id, customerId: customerId!, amount: walletAmountUsed, orderId: created.id });
        await tx.paymentRecord.create({
          data: {
            shopId: shop.id,
            orderId: created.id,
            amount: walletAmountUsed,
            method: "WALLET",
            note: "Wallet credit redeemed at checkout",
          },
        });
      }

      // A wallet redemption above may have already fully paid this order at
      // creation time — no later staff mark_paid/closeTable call will ever
      // fire for an order that's born PAID, so any cashback just claimed
      // needs crediting right now instead of waiting for that hook.
      if (created.paymentStatus === "PAID") {
        await processOrderPaidRewards(tx, created);
      }

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

      createNotification(shop.id, {
        type: "NEW_ORDER",
        title: input.tableNumber ? `New order — Table ${input.tableNumber}` : `New order — ${order.billNumber}`,
        body: `${formatCurrency(Number(order.grandTotal), shop.currency)} · ${order.items.length} item${order.items.length === 1 ? "" : "s"}`,
        link: `/admin/orders/${order.id}`,
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
      | {
          status: string;
          items: {
            productId: string | null;
            name: string;
            price: number;
            quantity: number;
            categoryId?: string;
            imageUrl?: string | null;
          }[];
        }[]
      | undefined;
    let sessionBill: ReturnType<typeof computeSessionBill> | undefined;
    let sessionStatus: string | null = null;
    if (order.tableSessionId) {
      try {
        const [session, ordersInSession] = await Promise.all([
          db.tableSession.findUnique({ where: { id: order.tableSessionId } }),
          db.order.findMany({
            where: { tableSessionId: order.tableSessionId, status: { not: "CANCELLED" } },
            include: { items: { include: { product: { select: { categoryId: true, imageUrl: true } } } } },
          }),
        ]);
        sessionStatus = session?.status ?? null;

        // Both checks matter: ordersInSession.length === 1 alone would
        // re-fire on a retried/duplicate submission of what was originally
        // the table's first order, since this whole block runs even when
        // isDuplicate is true (it sits outside the `if (!isDuplicate)` guard
        // above, unlike the push/publish calls there).
        if (!isDuplicate && ordersInSession.length === 1 && session) {
          createNotification(shop.id, {
            type: "TABLE_OCCUPIED",
            title: `Table ${session.tableNumber} occupied`,
            body: input.customerName ? `New guest — ${input.customerName}` : "New guest seated",
            link: "/admin/tables",
          }).catch(() => {});
        }

        sessionOrders = ordersInSession.map((o) => ({
          status: o.status,
          items: o.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: Number(item.price),
            quantity: item.quantity,
            categoryId: item.product?.categoryId,
            imageUrl: item.product?.imageUrl,
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
