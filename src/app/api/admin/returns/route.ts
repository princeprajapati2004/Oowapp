import { NextResponse } from "next/server";
import { z } from "zod";
import { ForbiddenError } from "@/lib/session";
import { requireShopActor, actorAuditFields, type ShopActor } from "@/lib/shop-actor";
import { handleApiError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { searchReturns, getReturnSummary } from "@/lib/services/return-search";
import { createReturnRequest } from "@/lib/services/return-request";
import { RETURN_REASONS } from "@/lib/return-status";
import { toReturnEvent } from "@/lib/server/order-events";
import type { StaffRole } from "@/generated/prisma/client";

// Same shape/rationale as STAFF_ALLOWED_ACTIONS in
// src/app/api/admin/orders/[id]/route.ts — WAITER can log a return on a
// customer's behalf (front-of-house), KITCHEN can't; mutating status
// transitions (approve/reject/refund) are MANAGER-only, enforced in
// src/app/api/admin/returns/[id]/route.ts.
const RETURN_CREATE_ALLOWED: Record<StaffRole, boolean> = {
  KITCHEN: false,
  WAITER: true,
  MANAGER: true,
};

function assertActorCanCreate(actor: ShopActor) {
  if (actor.kind === "admin") return;
  if (!RETURN_CREATE_ALLOWED[actor.staffRole]) {
    throw new ForbiddenError(`Your role (${actor.staffRole}) can't create return requests.`);
  }
}

const createReturnSchema = z
  .object({
    orderId: z.string(),
    items: z
      .array(z.object({ orderItemId: z.string(), quantity: z.number().int().positive() }))
      .min(1),
    reason: z.enum(RETURN_REASONS as [string, ...string[]]),
    reasonOtherText: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
    evidencePhotoUrls: z.array(z.string().url()).max(6).optional(),
  })
  .refine((v) => v.reason !== "OTHER" || !!v.reasonOtherText?.trim(), {
    message: "Please describe the reason for return",
    path: ["reasonOtherText"],
  });

export async function GET(request: Request) {
  try {
    const actor = await requireShopActor();
    const { searchParams } = new URL(request.url);

    const cursor = searchParams.get("cursor");
    const [result, summary] = await Promise.all([
      searchReturns(actor.shopId, {
        search: searchParams.get("search") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        orderId: searchParams.get("orderId") ?? undefined,
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
        cursor: cursor ?? undefined,
        pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
      }),
      cursor ? Promise.resolve(null) : getReturnSummary(actor.shopId),
    ]);

    return NextResponse.json({ ...result, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireShopActor();
    assertActorCanCreate(actor);
    const body = await request.json();
    const parsed = createReturnSchema.parse(body);

    const created = await createReturnRequest({
      orderId: parsed.orderId,
      shopId: actor.shopId,
      items: parsed.items,
      reason: parsed.reason as Parameters<typeof createReturnRequest>[0]["reason"],
      reasonOtherText: parsed.reasonOtherText,
      notes: parsed.notes,
      evidencePhotoUrls: parsed.evidencePhotoUrls,
      initiatedByType: actor.kind === "admin" ? "admin" : "staff",
      initiatedById: actor.actorId,
    });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "RETURN_REQUESTED",
      ...actorAuditFields(actor),
      targetType: "return_request",
      targetId: created.id,
      shopId: actor.shopId,
      metadata: {
        orderId: created.orderId,
        billNumber: created.order.billNumber,
        items: created.items.map((i) => ({ productName: i.productName, quantity: i.quantity })),
        reason: created.reason,
        requestedRefundAmount: Number(created.requestedRefundAmount),
      },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(toReturnEvent(created), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
