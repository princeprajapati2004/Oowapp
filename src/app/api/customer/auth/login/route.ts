import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { customerLoginSchema } from "@/lib/validation/customer-auth";
import {
  verifyCustomerPassword,
  signCustomerSession,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_SECONDS,
} from "@/lib/customer-auth";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`customer-auth:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = customerLoginSchema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    const customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: input.phone } },
    });
    if (!customer) {
      return NextResponse.json({ error: "Invalid phone number or password" }, { status: 401 });
    }

    const valid = await verifyCustomerPassword(input.password, customer.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid phone number or password" }, { status: 401 });
    }

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
