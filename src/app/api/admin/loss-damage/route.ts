import { NextResponse } from "next/server";
import { z } from "zod";
import { ForbiddenError } from "@/lib/session";
import { requireShopActor, actorAuditFields, type ShopActor } from "@/lib/shop-actor";
import { handleApiError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import {
  createLossDamageRecord,
  searchLossDamageRecords,
  getLossDamageSummary,
  toLossDamagePayload,
} from "@/lib/services/loss-damage";
import { LOSS_DAMAGE_TYPES, DAMAGE_TYPES } from "@/lib/loss-damage-status";
import type { StaffRole } from "@/generated/prisma/client";

// Inventory/cost-affecting, same posture as return money-actions —
// MANAGER-only for staff, always allowed for the owner.
const LOSS_DAMAGE_CREATE_ALLOWED: Record<StaffRole, boolean> = {
  KITCHEN: false,
  WAITER: false,
  MANAGER: true,
};

function assertActorCanCreate(actor: ShopActor) {
  if (actor.kind === "admin") return;
  if (!LOSS_DAMAGE_CREATE_ALLOWED[actor.staffRole]) {
    throw new ForbiddenError(`Your role (${actor.staffRole}) can't record loss/damage.`);
  }
}

const createSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  type: z.enum(LOSS_DAMAGE_TYPES as [string, ...string[]]),
  damageType: z.enum(DAMAGE_TYPES as [string, ...string[]]).optional(),
  notes: z.string().trim().max(1000).optional(),
  date: z.string().optional(),
  evidencePhotoUrls: z.array(z.string().url()).max(6).optional(),
  clientRequestId: z.string().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireShopActor();
    const { searchParams } = new URL(request.url);

    const [result, summary] = await Promise.all([
      searchLossDamageRecords(actor.shopId, {
        search: searchParams.get("search") ?? undefined,
        type: searchParams.get("type") ?? undefined,
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
        cursor: searchParams.get("cursor") ?? undefined,
        pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
      }),
      searchParams.get("cursor") ? Promise.resolve(null) : getLossDamageSummary(actor.shopId),
    ]);

    return NextResponse.json({
      records: result.records.map(toLossDamagePayload),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireShopActor();
    assertActorCanCreate(actor);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const created = await createLossDamageRecord({
      shopId: actor.shopId,
      productId: parsed.productId,
      quantity: parsed.quantity,
      type: parsed.type as Parameters<typeof createLossDamageRecord>[0]["type"],
      damageType: parsed.damageType as Parameters<typeof createLossDamageRecord>[0]["damageType"],
      notes: parsed.notes,
      date: parsed.date ? new Date(parsed.date) : undefined,
      evidencePhotoUrls: parsed.evidencePhotoUrls,
      clientRequestId: parsed.clientRequestId,
      createdBy: actor.actorId,
    });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "LOSS_DAMAGE_CREATED",
      ...actorAuditFields(actor),
      targetType: "loss_damage_record",
      targetId: created.id,
      shopId: actor.shopId,
      metadata: {
        productId: created.productId,
        productName: created.productName,
        quantity: created.quantity,
        type: created.type,
        totalLossValue: created.totalLossValue != null ? Number(created.totalLossValue) : null,
      },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(toLossDamagePayload(created), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
