import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { productSchema } from "@/lib/validation/product";
import { listProducts, createProduct } from "@/lib/services/product";
import { checkSubscriptionLimit, assertLimitNotExceededInTx } from "@/lib/services/subscription-limits";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const products = await listProducts(session.shopId);
    return NextResponse.json(products);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const { limit, planName } = await checkSubscriptionLimit(session.adminId, "PRODUCTS", 1);
    const body = await request.json();
    const input = productSchema.parse(body);

    // Recheck atomically, immediately before the insert, in the same
    // transaction — closes the race the early check above can't (two
    // concurrent requests could otherwise both pass it before either
    // product row exists). PRODUCTS is account-wide, across every shop.
    const product = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertLimitNotExceededInTx(tx, session.adminId, "PRODUCTS", limit, planName, 1, async (tx) => {
        const shops = await tx.shop.findMany({ where: { adminId: session.adminId }, select: { id: true } });
        return tx.product.count({ where: { shopId: { in: shops.map((s) => s.id) } } });
      });
      return createProduct(session.shopId, input, tx);
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
