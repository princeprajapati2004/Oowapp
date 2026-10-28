import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { ForbiddenError } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { getNextStatuses, deriveOrderType } from "@/lib/order-status";
import { getPrepTimeSettings, calculatePrepEstimate } from "@/lib/services/prep-time";
import { getActiveDisplayByToken } from "@/lib/services/display";
import { publishOrderEvent, toOrderEvent } from "@/lib/server/order-events";
import { createNotification } from "@/lib/services/notification";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The one write-capable public endpoint in Order Display Management — only
 * reachable when the display is a KITCHEN type with allowStaffActions on
 * (an owner opt-in per display, off by default — see Display.allowStaffActions'
 * schema comment). Deliberately whitelists exactly the three actions
 * StaffRole.KITCHEN gets in the authenticated admin route
 * (src/app/api/admin/orders/[id]/route.ts) — no payments, discounts,
 * cancellations or edits are reachable here, and never will be.
 */
const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["CONFIRMED", "PREPARING", "READY"]) }),
  z.object({ action: z.literal("priority"), priorityFlag: z.enum(["VIP", "RUSH"]).nullable() }),
  z.object({ action: z.literal("flag_delayed"), extraMinutes: z.number().int().min(1).max(120).optional() }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string; orderId: string }> }) {
  try {
    const { token, orderId } = await params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`display:action:${token}`, 60, 60_000) || !checkRateLimit(`display:action:ip:${ip}`, 60, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const display = await getActiveDisplayByToken(token);
    if (!display) throw new NotFoundError("This display link is invalid or has been deactivated.");
    if (display.type !== "KITCHEN" || !display.allowStaffActions) {
      throw new ForbiddenError("This display can't act on orders.");
    }

    const existing = await db.order.findFirst({ where: { id: orderId, shopId: display.shopId } });
    if (!existing) throw new NotFoundError("Order not found");

    const parsed = patchSchema.parse(await request.json());
    const actorId = `display:${display.id}`;

    let data: Record<string, unknown> = {};
    let statusEventStatus: string | null = null;
    let pendingPrepEstimateEvent: { estimatedMinutes: number; estimatedReadyAt: Date; reason: string } | null = null;

    if (parsed.action === "status") {
      const allowed = getNextStatuses(existing);
      if (!allowed.includes(parsed.status as (typeof allowed)[number])) {
        return NextResponse.json({ error: `Order can't move from ${existing.status} to ${parsed.status}.` }, { status: 409 });
      }
      data = { status: parsed.status };
      statusEventStatus = parsed.status;

      if (parsed.status === "CONFIRMED" && !existing.acceptedAt) {
        const acceptedAt = new Date();
        const [prepShop, itemsForEstimate] = await Promise.all([
          db.shop.findUnique({ where: { id: display.shopId }, select: { prepTimeSettings: true, timezone: true } }),
          db.orderItem.findMany({
            where: { orderId },
            select: { quantity: true, product: { select: { prepTimeMinutes: true, category: { select: { prepTimeMinutes: true } } } } },
          }),
        ]);
        const settings = getPrepTimeSettings(prepShop?.prepTimeSettings);
        const estimate = calculatePrepEstimate({
          items: itemsForEstimate.map((item: (typeof itemsForEstimate)[number]) => ({
            quantity: item.quantity,
            resolvedPrepTimeMinutes: item.product?.prepTimeMinutes ?? item.product?.category?.prepTimeMinutes ?? null,
          })),
          orderType: deriveOrderType(existing),
          settings,
          timezone: prepShop?.timezone ?? "Asia/Kolkata",
          now: acceptedAt,
        });
        const estimatedReadyAt = new Date(acceptedAt.getTime() + estimate.totalMinutes * 60_000);
        data = { ...data, acceptedAt, estimatedPrepMinutes: estimate.totalMinutes, estimatedReadyAt };
        pendingPrepEstimateEvent = { estimatedMinutes: estimate.totalMinutes, estimatedReadyAt, reason: "initial" };
      }
      if (parsed.status === "READY" && !existing.actualReadyAt) {
        data = { ...data, actualReadyAt: new Date() };
      }
    } else if (parsed.action === "priority") {
      data = { priorityFlag: parsed.priorityFlag };
    } else {
      if (!["PENDING", "CONFIRMED", "PREPARING"].includes(existing.status)) {
        return NextResponse.json({ error: "Only an order that's still being prepared can be flagged delayed." }, { status: 409 });
      }
      const prepShop = await db.shop.findUnique({ where: { id: display.shopId }, select: { prepTimeSettings: true } });
      const settings = getPrepTimeSettings(prepShop?.prepTimeSettings);
      const extraMinutes = parsed.extraMinutes ?? settings.bufferMinutes;
      const baseFrom = existing.estimatedReadyAt ?? new Date();
      const estimatedReadyAt = new Date(baseFrom.getTime() + extraMinutes * 60_000);
      const estimatedPrepMinutes = (existing.estimatedPrepMinutes ?? settings.defaultMinutes) + extraMinutes;
      data = { prepDelayFlag: true, estimatedReadyAt, estimatedPrepMinutes };
      pendingPrepEstimateEvent = { estimatedMinutes: estimatedPrepMinutes, estimatedReadyAt, reason: "delay_flagged" };

      const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
      writeAuditLog({
        action: "ORDER_PREP_DELAYED",
        actorType: "system",
        actorId,
        targetType: "order",
        targetId: orderId,
        shopId: display.shopId,
        metadata: { extraMinutes, billNumber: existing.billNumber, displayName: display.name },
        ipAddress,
        userAgent,
        requestId,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db.order as any).update({ where: { id: orderId }, data, include: { items: true } });

    if (statusEventStatus) {
      await db.orderStatusEvent.create({
        data: { orderId, status: statusEventStatus as Prisma.OrderStatusEventCreateInput["status"], changedBy: actorId },
      });
    }
    if (pendingPrepEstimateEvent) {
      await db.orderPrepEstimateEvent.create({
        data: {
          orderId,
          estimatedReadyAt: pendingPrepEstimateEvent.estimatedReadyAt,
          estimatedMinutes: pendingPrepEstimateEvent.estimatedMinutes,
          reason: pendingPrepEstimateEvent.reason,
          setBy: actorId,
        },
      });
    }

    if (statusEventStatus) {
      createNotification(display.shopId, {
        type: "ORDER_STATUS_CHANGED",
        title: `Order #${existing.billNumber} — ${statusEventStatus}`,
        body: `Status updated to ${statusEventStatus.toLowerCase()} from ${display.name}`,
        link: `/admin/orders/${orderId}`,
      }).catch(() => {});
    }

    publishOrderEvent(display.shopId, { type: "order.updated", order: toOrderEvent(updated) });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
