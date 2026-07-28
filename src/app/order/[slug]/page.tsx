import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { serializeProducts, serializeTaxes } from "@/lib/serialize";
import { getCustomerSession } from "@/lib/customer-session";
import { getVerifiedPhone } from "@/lib/phone-verify-auth";
import { db } from "@/lib/db";
import { CustomerMenu } from "@/components/customer/customer-menu";
import type { ActiveSession } from "@/lib/types/customer";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const [{ slug }, resolvedSearch] = await Promise.all([params, searchParams]);
  const shop = await getPublicShopBundle(slug);

  if (!shop) {
    notFound();
  }

  const prefilledTable = resolvedSearch.table?.trim() || undefined;
  const { categories, products, taxes, ...shopInfo } = shop;

  const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });

  // A customer session is scoped to one shop — confirm it matches this one
  // before treating the visitor as logged in here.
  let customer: { name: string; phone: string } | null = null;
  const session = await getCustomerSession();
  if (session && shopRow && shopRow.id === session.shopId) {
    customer = await db.customer.findUnique({
      where: { id: session.customerId },
      select: { name: true, phone: true },
    });
  }

  // A phone verified via OTP earlier in the same sitting (see phone-verification.tsx) —
  // separate from the password-based Customer account above, so guests never need one.
  const verifiedPhone = shopRow ? await getVerifiedPhone(shopRow.id) : null;

  // A QR-scanned table with an already-active session gets its prior orders
  // shown as a locked "already on this table" panel and its next submission
  // treated as an incremental (delta-only) round — see order-sheet.tsx. Not
  // fetched for manually-typed table numbers (no `?table=` param): the
  // server-side session attach on submit still works correctly either way,
  // this only affects whether the cart pre-shows what's already ordered.
  let activeSession: ActiveSession = null;
  if (shop.enableTableQr && shopRow && prefilledTable) {
    const found = await db.tableSession.findFirst({
      where: { shopId: shopRow.id, tableNumber: prefilledTable, status: { in: ["ACTIVE", "AWAITING_PAYMENT"] } },
      include: {
        orders: {
          where: { status: { not: "CANCELLED" } },
          include: { items: { include: { product: { select: { categoryId: true } } } } },
        },
      },
    });
    if (found) {
      activeSession = {
        id: found.id,
        status: found.status,
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
  }

  return (
    <CustomerMenu
      shop={shopInfo}
      categories={categories}
      products={serializeProducts(products)}
      taxes={serializeTaxes(taxes)}
      prefilledTable={prefilledTable}
      customer={customer}
      activeSession={activeSession}
      verifiedPhone={verifiedPhone}
    />
  );
}
