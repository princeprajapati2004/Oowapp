import { NextResponse } from "next/server";
import { z } from "zod";
import { ForbiddenError } from "@/lib/session";
import { requireShopActor, actorAuditFields, type ShopActor } from "@/lib/shop-actor";
import { handleApiError, NotFoundError, ConflictError, ReturnError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { db } from "@/lib/db";
import { releaseReturnQuantity } from "@/lib/services/return-reservation";
import { createLinkedLossDamageRecord } from "@/lib/services/loss-damage";
import { creditWallet } from "@/lib/services/wallet";
import {
  RETURN_DETAIL_INCLUDE,
  toReturnDetailPayload,
  type ReturnDetailPayload,
} from "@/lib/services/return-request";
import { publishOrderEvent, toReturnEvent } from "@/lib/server/order-events";
import {
  REFUND_METHODS,
  RETURN_VALID_PRIOR_STATUS,
  RETURN_ITEM_CONDITIONS,
  conditionRestocksInventory,
  CONDITION_TO_LOSS_DAMAGE_TYPE,
} from "@/lib/return-status";
import type { AuditAction, StaffRole } from "@/generated/prisma/client";
import type { ReturnStatus, ReturnItemCondition } from "@/generated/prisma/enums";

// Money-affecting return actions are MANAGER-only — same posture as the
// existing "mark_refunded" order action (the closest analog in this
// codebase), which is also restricted to MANAGER via
// src/app/api/admin/orders/[id]/route.ts's STAFF_ALLOWED_ACTIONS.
const RETURN_MUTATE_ALLOWED: Record<StaffRole, boolean> = {
  KITCHEN: false,
  WAITER: false,
  MANAGER: true,
};

function assertActorCanMutate(actor: ShopActor) {
  if (actor.kind === "admin") return;
  if (!RETURN_MUTATE_ALLOWED[actor.staffRole]) {
    throw new ForbiddenError(`Your role (${actor.staffRole}) can't manage returns.`);
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1).max(300) }),
  z.object({
    action: z.literal("mark_item_returned"),
    items: z
      .array(
        z.object({
          id: z.string(),
          condition: z.enum(RETURN_ITEM_CONDITIONS as [string, ...string[]]),
        })
      )
      .min(1),
  }),
  z.object({
    action: z.literal("process_refund"),
    refundMethod: z.enum(REFUND_METHODS as [string, ...string[]]),
    refundReference: z.string().trim().max(100).optional(),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({ action: z.literal("mark_refund_failed"), reason: z.string().trim().min(1).max(300) }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(300).optional() }),
]);

type PatchAction = z.infer<typeof patchSchema>;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireShopActor();
    const { id } = await params;

    const existing = await db.returnRequest.findFirst({
      where: { id, shopId: actor.shopId },
      include: RETURN_DETAIL_INCLUDE,
    });
    if (!existing) throw new NotFoundError("Return not found");

    return NextResponse.json(toReturnDetailPayload(existing));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireShopActor();
    assertActorCanMutate(actor);
    const { id } = await params;
    const body = await request.json();
    const parsed: PatchAction = patchSchema.parse(body);

    const existing = await db.returnRequest.findFirst({
      where: { id, shopId: actor.shopId },
      include: {
        items: { include: { orderItem: { select: { productId: true } } } },
        order: { select: { id: true, billNumber: true } },
      },
    });
    if (!existing) throw new NotFoundError("Return not found");

    const validPrior = RETURN_VALID_PRIOR_STATUS[parsed.action];
    if (!validPrior.includes(existing.status)) {
      throw new ConflictError(`This return can't be ${parsed.action.replace(/_/g, " ")} from its current status.`);
    }

    if (parsed.action === "mark_item_returned") {
      const existingIds = new Set(existing.items.map((i) => i.id));
      const parsedIds = new Set(parsed.items.map((i) => i.id));
      const coversAll = existing.items.every((i) => parsedIds.has(i.id)) && parsed.items.every((i) => existingIds.has(i.id));
      if (!coversAll) {
        throw new ReturnError("Specify a condition for every returned item, and only items on this return");
      }
    }

    if (parsed.action === "process_refund" && parsed.refundMethod === "WALLET" && !existing.customerId) {
      throw new ReturnError("Wallet refund requires a logged-in customer — this return has none");
    }

    let newStatus: ReturnStatus;
    let data: Record<string, unknown>;
    let auditAction: AuditAction;
    let auditMetadata: Record<string, unknown>;
    let releaseQuantities = false;

    switch (parsed.action) {
      case "approve":
        newStatus = "RETURN_APPROVED";
        data = { status: newStatus, approvedById: actor.actorId, approvedAt: new Date() };
        auditAction = "RETURN_APPROVED";
        auditMetadata = {};
        break;
      case "reject":
        newStatus = "RETURN_REJECTED";
        data = { status: newStatus, rejectedById: actor.actorId, rejectedAt: new Date(), rejectionReason: parsed.reason };
        auditAction = "RETURN_REJECTED";
        auditMetadata = { reason: parsed.reason };
        releaseQuantities = true;
        break;
      case "mark_item_returned":
        // Collapses ITEM_RETURNED -> REFUND_PENDING into one owner click —
        // there's no gateway callback to wait on (no payment gateway
        // integration exists in this app), so a separate "processing" click
        // would have nothing real to represent. Both steps are still
        // recorded as distinct ReturnStatusEvent rows below.
        newStatus = "REFUND_PENDING";
        data = { status: newStatus, itemReturnedById: actor.actorId, itemReturnedAt: new Date() };
        auditAction = "RETURN_ITEM_RETURNED";
        auditMetadata = { autoQueuedForRefund: true, conditions: parsed.items };
        break;
      case "process_refund":
        newStatus = "REFUNDED";
        data = {
          status: newStatus,
          refundMethod: parsed.refundMethod,
          refundReference: parsed.refundReference || null,
          refundProcessedById: actor.actorId,
          refundProcessedAt: new Date(),
        };
        auditAction = "RETURN_REFUND_PROCESSED";
        auditMetadata = {
          refundMethod: parsed.refundMethod,
          refundReference: parsed.refundReference,
          amount: Number(existing.requestedRefundAmount),
        };
        break;
      case "mark_refund_failed":
        newStatus = "REFUND_FAILED";
        data = { status: newStatus, refundFailedReason: parsed.reason, refundFailedAt: new Date() };
        auditAction = "RETURN_REFUND_FAILED";
        auditMetadata = { reason: parsed.reason };
        break;
      case "cancel":
        newStatus = "CANCELLED";
        data = { status: newStatus, cancelledById: actor.actorId, cancelledAt: new Date(), cancelReason: parsed.reason ?? null };
        auditAction = "RETURN_CANCELLED";
        auditMetadata = { reason: parsed.reason };
        releaseQuantities = true;
        break;
    }

    const updated = await db.$transaction(async (tx) => {
      // Wallet credit happens before the CAS update so its result
      // (walletTransactionId) can be folded into `data` — but only actually
      // takes effect if the CAS below succeeds, since this whole function is
      // one transaction; a losing concurrent request rolls the credit back too.
      if (parsed.action === "process_refund" && parsed.refundMethod === "WALLET") {
        const { transactionId } = await creditWallet(tx, {
          shopId: actor.shopId,
          customerId: existing.customerId!,
          type: "REFUND_CREDIT",
          amount: Number(existing.requestedRefundAmount),
          orderId: null, // see creditWallet's doc comment — order-scoped idempotency doesn't fit multi-return orders; the CAS below is the real guard
          description: `Refund — Order #${existing.order.billNumber}`,
        });
        data = { ...data, walletTransactionId: transactionId };
      }

      // CAS: only succeeds if status is still one of the valid prior states —
      // prevents two concurrent PATCHes (e.g. two browser tabs both clicking
      // "Process Refund") from both succeeding.
      const result = await tx.returnRequest.updateMany({
        where: { id, status: { in: validPrior } },
        data,
      });
      if (result.count === 0) {
        throw new ConflictError("This return was just updated elsewhere — please refresh and try again");
      }

      if (releaseQuantities) {
        for (const item of existing.items) {
          await releaseReturnQuantity(tx, item.orderItemId, item.quantity);
        }
      }

      if (parsed.action === "mark_item_returned") {
        // Physical disposition per item — restock sellable inventory, or
        // spin off a linked LossDamageRecord. Each ReturnItem's condition is
        // set exactly once here (enforced by the outer "covers every item"
        // validation above + this whole block only running once the CAS
        // above has already succeeded), so this can never double-adjust
        // stock even under a retried/duplicate request.
        for (const itemInput of parsed.items) {
          const returnItem = existing.items.find((i) => i.id === itemInput.id)!;
          const condition = itemInput.condition as ReturnItemCondition;
          await tx.returnItem.update({ where: { id: returnItem.id }, data: { condition } });

          const productId = returnItem.orderItem.productId;
          if (!productId) continue; // manual/legacy order line with no catalog product — nothing to adjust

          if (conditionRestocksInventory(condition)) {
            const product = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
            if (product?.stock != null) {
              await tx.product.update({ where: { id: productId }, data: { stock: { increment: returnItem.quantity } } });
            }
          } else {
            await createLinkedLossDamageRecord(tx, {
              shopId: actor.shopId,
              productId,
              returnItemId: returnItem.id,
              quantity: returnItem.quantity,
              type: CONDITION_TO_LOSS_DAMAGE_TYPE[condition]!,
              createdBy: actor.actorId,
            });
          }
        }

        await tx.returnStatusEvent.create({
          data: { returnId: id, status: "ITEM_RETURNED", changedBy: actor.actorId },
        });
        await tx.returnStatusEvent.create({
          data: { returnId: id, status: "REFUND_PENDING", changedBy: actor.actorId, note: "Auto-queued for refund" },
        });
      } else {
        await tx.returnStatusEvent.create({
          data: {
            returnId: id,
            status: newStatus,
            changedBy: actor.actorId,
            note: "reason" in parsed ? parsed.reason : undefined,
          },
        });
      }

      return tx.returnRequest.findUniqueOrThrow({ where: { id }, include: RETURN_DETAIL_INCLUDE });
    });

    publishOrderEvent(actor.shopId, { type: "return.updated", return: toReturnEvent(updated) });

    if (updated.walletTransactionId) {
      auditMetadata = { ...auditMetadata, walletTransactionId: updated.walletTransactionId };
    }

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: auditAction,
      ...actorAuditFields(actor),
      targetType: "return_request",
      targetId: id,
      shopId: actor.shopId,
      metadata: { ...auditMetadata, returnId: id, orderId: existing.orderId, billNumber: existing.order.billNumber },
      ipAddress,
      userAgent,
      requestId,
    });

    const payload: ReturnDetailPayload = toReturnDetailPayload(updated);
    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError(error);
  }
}
