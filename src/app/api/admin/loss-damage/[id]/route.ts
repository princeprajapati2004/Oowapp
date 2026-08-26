import { NextResponse } from "next/server";
import { requireShopActor } from "@/lib/shop-actor";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { toLossDamagePayload } from "@/lib/services/loss-damage";

const DETAIL_INCLUDE = {
  product: { select: { id: true, name: true, imageUrl: true } },
  returnItem: {
    select: {
      id: true,
      returnId: true,
      returnRequest: { select: { id: true, orderId: true } },
    },
  },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireShopActor();
    const { id } = await params;

    const record = await db.lossDamageRecord.findFirst({
      where: { id, shopId: actor.shopId },
      include: DETAIL_INCLUDE,
    });
    if (!record) throw new NotFoundError("Loss/Damage record not found");

    return NextResponse.json(toLossDamagePayload(record));
  } catch (error) {
    return handleApiError(error);
  }
}
