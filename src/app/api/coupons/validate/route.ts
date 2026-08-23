import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError, InvalidCouponError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateCouponSchema } from "@/lib/validation/coupon";
import { previewCoupon } from "@/lib/services/coupon";
import { resolveOrderItems } from "@/lib/services/order-items";
import { getCustomerSession } from "@/lib/customer-session";

// Read-only preview for the "Apply" button — never claims coupon usage. The
// real, atomic claim only happens inside POST /api/orders's transaction, at
// order-creation time (see redeemCoupon in src/lib/services/coupon.ts).
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`coupon-validate:${ip}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = validateCouponSchema.parse(body);

    if (!checkRateLimit(`coupon-validate:${ip}:${input.code.toUpperCase()}`, 10, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many attempts — please wait a while." }, { status: 429 });
    }

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    const resolvedItems = await resolveOrderItems(shop.id, input.items);
    if (resolvedItems.length === 0) {
      throw new InvalidCouponError("Your cart has no valid items to apply a coupon to");
    }

    const customerSession = await getCustomerSession();
    const customerId =
      customerSession && customerSession.shopId === shop.id ? customerSession.customerId : null;

    const result = await previewCoupon(shop.id, input.code, resolvedItems, customerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
