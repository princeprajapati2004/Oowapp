import { NextResponse } from "next/server";
import { requireShopActor } from "@/lib/shop-actor";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

// Lightweight, staff-accessible product lookup for the "+ Add Loss / Damage"
// product picker — deliberately separate from GET /api/admin/products, which
// is owner-only (requireAdminSession) and returns the full owner-facing
// product shape. Staff with MANAGER role can create loss/damage records but
// can't call the owner-only route, so this exists purely to support that
// picker with the minimal fields it needs.
export async function GET() {
  try {
    const actor = await requireShopActor();
    const products = await db.product.findMany({
      where: { shopId: actor.shopId },
      select: { id: true, name: true, imageUrl: true, price: true, costPrice: true, stock: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        price: Number(p.price),
        costPrice: p.costPrice != null ? Number(p.costPrice) : null,
        stock: p.stock,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}
