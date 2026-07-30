import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-session";
import { getVerifiedPhone } from "@/lib/phone-verify-auth";
import type { ActiveSession } from "@/lib/types/customer";

/**
 * Shared by both /order/[slug] (menu) and /order/[slug]/bill (final bill) —
 * each page renders this identically so a customer looks logged-in/verified
 * the same way on either screen.
 */
export async function resolveCustomerIdentity(shopId: string) {
  let customer: { name: string; phone: string } | null = null;
  const session = await getCustomerSession();
  // A customer session is scoped to one shop — confirm it matches this one
  // before treating the visitor as logged in here.
  if (session && session.shopId === shopId) {
    customer = await db.customer.findUnique({
      where: { id: session.customerId },
      select: { name: true, phone: true },
    });
  }

  // A phone verified via OTP earlier in the same sitting (see phone-verification.tsx) —
  // separate from the password-based Customer account above, so guests never need one.
  const verifiedPhone = await getVerifiedPhone(shopId);

  return { customer, verifiedPhone };
}

/**
 * A QR-scanned table with an already-active session gets its prior orders
 * shown as a locked "already on this table" panel and its next submission
 * treated as an incremental (delta-only) round — see final-bill-page.tsx.
 * Not fetched for manually-typed table numbers (no
 * `?table=` param): the server-side session attach on submit still works
 * correctly either way, this only affects whether the cart pre-shows what's
 * already ordered.
 */
export async function resolveActiveTableSession(args: {
  shopId: string;
  enableTableQr: boolean;
  tableNumber?: string;
}): Promise<ActiveSession> {
  if (!args.enableTableQr || !args.tableNumber) return null;

  const found = await db.tableSession.findFirst({
    where: { shopId: args.shopId, tableNumber: args.tableNumber, status: { in: ["ACTIVE", "AWAITING_PAYMENT"] } },
    include: {
      orders: {
        where: { status: { not: "CANCELLED" } },
        include: { items: { include: { product: { select: { categoryId: true } } } } },
      },
    },
  });
  if (!found) return null;

  return {
    id: found.id,
    status: found.status,
    billRequestedAt: found.billRequestedAt ? found.billRequestedAt.toISOString() : null,
    paymentMethod: found.paymentMethod,
    orders: found.orders.map((order) => ({
      status: order.status,
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity,
        categoryId: item.product?.categoryId,
      })),
    })),
  };
}
