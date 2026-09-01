import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-session";
import { handleApiError, NotFoundError, ConflictError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { releaseReturnQuantity } from "@/lib/services/return-reservation";
import { RETURN_DETAIL_INCLUDE, toCustomerReturnDetailPayload } from "@/lib/services/return-request";
import { publishOrderEvent, toReturnEvent } from "@/lib/server/order-events";
import { RETURN_VALID_PRIOR_STATUS } from "@/lib/return-status";

const patchSchema = z.object({ action: z.literal("cancel") });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  // Ownership enforced by scoping the query itself, same posture as every
  // other customer-facing route — a return belonging to a different
  // customer simply doesn't match and comes back 404, never leaking that it
  // exists.
  const existing = await db.returnRequest.findFirst({
    where: { id, shopId: session.shopId, customerId: session.customerId },
    include: RETURN_DETAIL_INCLUDE,
  });
  if (!existing) {
    return NextResponse.json({ error: "Return not found" }, { status: 404 });
  }

  return NextResponse.json(toCustomerReturnDetailPayload(existing));
}

// Customer self-cancel of their own request, mirroring the existing
// customer self-cancel-order precedent — restricted to RETURN_REQUESTED
// only (once the owner has acted on it, only the owner can cancel it via
// the admin route).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCustomerSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await params;
    patchSchema.parse(await request.json());

    const existing = await db.returnRequest.findFirst({
      where: { id, shopId: session.shopId, customerId: session.customerId },
      include: { items: true, order: { select: { billNumber: true } } },
    });
    if (!existing) throw new NotFoundError("Return not found");

    const validPrior = RETURN_VALID_PRIOR_STATUS.cancel;
    if (!validPrior.includes(existing.status)) {
      throw new ConflictError("This return can no longer be cancelled.");
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.returnRequest.updateMany({
        where: { id, status: { in: validPrior } },
        data: { status: "CANCELLED", cancelledById: session.customerId, cancelledAt: new Date() },
      });
      if (result.count === 0) {
        throw new ConflictError("This return was just updated elsewhere — please refresh and try again");
      }
      for (const item of existing.items) {
        await releaseReturnQuantity(tx, item.orderItemId, item.quantity);
      }
      await tx.returnStatusEvent.create({
        data: { returnId: id, status: "CANCELLED", changedBy: session.customerId },
      });
      return tx.returnRequest.findUniqueOrThrow({ where: { id }, include: RETURN_DETAIL_INCLUDE });
    });

    publishOrderEvent(session.shopId, { type: "return.updated", return: toReturnEvent(updated) });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "RETURN_CANCELLED",
      actorType: "customer",
      actorId: session.customerId,
      targetType: "return_request",
      targetId: id,
      shopId: session.shopId,
      metadata: { returnId: id, orderId: existing.orderId, billNumber: existing.order.billNumber },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(toCustomerReturnDetailPayload(updated));
  } catch (error) {
    return handleApiError(error);
  }
}
