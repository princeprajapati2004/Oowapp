import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { customerSignupSchema } from "@/lib/validation/customer-auth";
import {
  hashCustomerPassword,
  signCustomerSession,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_SECONDS,
} from "@/lib/customer-auth";
import { linkGuestOrdersToCustomer } from "@/lib/link-guest-orders";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // Own (tighter) bucket from login — this endpoint's response distinguishes
    // an existing account, so it's a phone-number enumeration vector and gets
    // throttled harder than plain login attempts.
    if (!checkRateLimit(`customer-signup:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = customerSignupSchema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    const existing = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: input.phone } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this phone number already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashCustomerPassword(input.password);
    const customer = await db.customer.create({
      data: { shopId: shop.id, name: input.name, phone: input.phone, passwordHash },
    });

    await linkGuestOrdersToCustomer(shop.id, customer.id, input.phone);

    const token = await signCustomerSession({ customerId: customer.id, shopId: shop.id });
    const cookieStore = await cookies();
    cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CUSTOMER_SESSION_DURATION_SECONDS,
    });

    return NextResponse.json({ ok: true, name: customer.name });
  } catch (error) {
    return handleApiError(error);
  }
}
