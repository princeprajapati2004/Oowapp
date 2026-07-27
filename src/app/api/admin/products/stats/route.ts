import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

const WINDOW_DAYS = 30;

// Read-only, additive endpoint — real order-frequency counts for the manual
// order dialog's "Best Seller" / "Popular" badges. Never fabricated: a
// product with no orders in the window simply gets no badge.
export async function GET() {
  try {
    const session = await requireAdminSession();
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const rows = await db.orderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        order: { shopId: session.shopId, createdAt: { gte: since }, status: { not: "CANCELLED" } },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 15,
    });

    const stats = rows
      .filter((r) => r.productId)
      .map((r) => ({ productId: r.productId as string, orderCount: r._sum.quantity ?? 0 }));

    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
