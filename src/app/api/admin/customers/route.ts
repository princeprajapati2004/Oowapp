import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireAdminSession();

    // Most-recent order per distinct phone stands in for a customer
    // directory — there's no separate Customer model, so this is derived
    // straight from order history.
    const rows = await db.order.findMany({
      where: { shopId: session.shopId, customerPhone: { not: null } },
      distinct: ["customerPhone"],
      orderBy: { createdAt: "desc" },
      select: { customerName: true, customerPhone: true },
      take: 100,
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error);
  }
}
