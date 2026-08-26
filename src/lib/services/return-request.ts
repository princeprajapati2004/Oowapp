/**
 * Shared return-request creation logic, used by both the owner/staff-
 * initiated route (src/app/api/admin/returns/route.ts) and the customer
 * self-service route (src/app/api/customer/returns/route.ts) — one
 * implementation for the money-critical bits (refund calc, paid-amount cap,
 * quantity reservation) so the two entry points can never drift apart.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { ReturnReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ReturnError, NotFoundError } from "@/lib/api-utils";
import { round2 } from "@/lib/services/billing";
import { isOrderReturnEligible } from "@/lib/services/return-eligibility";
import { calculateItemRefund, assertRefundWithinPaidAmount } from "@/lib/services/refund-calculation";
import { reserveReturnQuantity } from "@/lib/services/return-reservation";
import { publishOrderEvent, toReturnEvent } from "@/lib/server/order-events";

export type CreateReturnItemInput = { orderItemId: string; quantity: number };

export type CreateReturnRequestInput = {
  orderId: string;
  shopId: string;
  // If set, the order must belong to this customer — defense in depth on
  // top of the caller's own scoped query (customer route always sets this).
  requireCustomerId?: string;
  items: CreateReturnItemInput[];
  reason: ReturnReason;
  reasonOtherText?: string | null;
  notes?: string | null;
  evidencePhotoUrls?: string[];
  initiatedByType: "admin" | "staff" | "customer";
  initiatedById: string | null;
};

export const RETURN_DETAIL_INCLUDE = {
  items: {
    include: {
      orderItem: { select: { productId: true } },
      lossDamageRecord: { select: { id: true } },
    },
  },
  statusEvents: { orderBy: { changedAt: "asc" as const } },
  evidencePhotos: { orderBy: { createdAt: "asc" as const } },
  order: {
    select: {
      id: true,
      shopId: true,
      billNumber: true,
      customerName: true,
      customerPhone: true,
      status: true,
      grandTotal: true,
      discountedTotal: true,
      paidAmount: true,
    },
  },
} satisfies Prisma.ReturnRequestInclude;

export type ReturnRequestDetail = Prisma.ReturnRequestGetPayload<{ include: typeof RETURN_DETAIL_INCLUDE }>;

export async function createReturnRequest(input: CreateReturnRequestInput): Promise<ReturnRequestDetail> {
  if (input.items.length === 0) {
    throw new ReturnError("Select at least one item to return");
  }
  if (input.reason === "OTHER" && !input.reasonOtherText?.trim()) {
    throw new ReturnError("Please describe the reason for return");
  }

  const order = await db.order.findFirst({
    where: {
      id: input.orderId,
      shopId: input.shopId,
      ...(input.requireCustomerId ? { customerId: input.requireCustomerId } : {}),
    },
    include: { items: true },
  });
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderReturnEligible(order)) {
    throw new ReturnError("This order isn't eligible for a return yet");
  }

  const orderItemsById = new Map(order.items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const reqItem of input.items) {
    if (!orderItemsById.has(reqItem.orderItemId)) {
      throw new ReturnError("One of the selected items doesn't belong to this order");
    }
    if (reqItem.quantity <= 0) {
      throw new ReturnError("Return quantity must be at least 1");
    }
    if (seen.has(reqItem.orderItemId)) {
      throw new ReturnError("Each item can only appear once in a single return request");
    }
    seen.add(reqItem.orderItemId);
  }

  const orderMoney = {
    subtotal: Number(order.subtotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    discountedTotal: order.discountedTotal != null ? Number(order.discountedTotal) : null,
  };

  const existingActiveReturns = await db.returnRequest.aggregate({
    where: { orderId: order.id, status: { notIn: ["RETURN_REJECTED", "CANCELLED"] } },
    _sum: { requestedRefundAmount: true },
  });
  const existingActiveRefundTotal = Number(existingActiveReturns._sum.requestedRefundAmount ?? 0);

  const returnItemsData: {
    orderItemId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    allocatedDiscountPerUnit: number;
    refundableAmount: number;
  }[] = [];
  let totalRefundAmount = 0;

  for (const reqItem of input.items) {
    const orderItem = orderItemsById.get(reqItem.orderItemId)!;
    const calc = calculateItemRefund(
      orderMoney,
      { lineTotal: Number(orderItem.lineTotal), quantity: orderItem.quantity, price: Number(orderItem.price) },
      reqItem.quantity
    );
    returnItemsData.push({
      orderItemId: orderItem.id,
      productName: orderItem.name,
      quantity: reqItem.quantity,
      unitPrice: calc.unitPrice,
      allocatedDiscountPerUnit: calc.allocatedDiscountPerUnit,
      refundableAmount: calc.refundableAmount,
    });
    totalRefundAmount += calc.refundableAmount;
  }
  totalRefundAmount = round2(totalRefundAmount);

  assertRefundWithinPaidAmount(
    order.paidAmount != null ? Number(order.paidAmount) : null,
    existingActiveRefundTotal,
    totalRefundAmount
  );

  const created = await db.$transaction(async (tx) => {
    for (const reqItem of input.items) {
      await reserveReturnQuantity(tx, reqItem.orderItemId, reqItem.quantity);
    }

    return tx.returnRequest.create({
      data: {
        shopId: order.shopId,
        orderId: order.id,
        customerId: order.customerId,
        status: "RETURN_REQUESTED",
        reason: input.reason,
        reasonOtherText: input.reason === "OTHER" ? input.reasonOtherText?.trim() : null,
        notes: input.notes?.trim() || null,
        initiatedByType: input.initiatedByType,
        initiatedById: input.initiatedById,
        requestedRefundAmount: totalRefundAmount,
        items: { create: returnItemsData },
        statusEvents: { create: { status: "RETURN_REQUESTED", changedBy: input.initiatedById } },
        evidencePhotos: input.evidencePhotoUrls?.length
          ? {
              create: input.evidencePhotoUrls.map((url) => ({
                url,
                uploadedByType: input.initiatedByType,
                uploadedById: input.initiatedById,
              })),
            }
          : undefined,
      },
      include: RETURN_DETAIL_INCLUDE,
    });
  });

  publishOrderEvent(order.shopId, { type: "return.created", return: toReturnEvent(created) });

  return created;
}

export type ReturnDetailPayload = {
  id: string;
  shopId: string;
  orderId: string;
  customerId: string | null;
  status: string;
  reason: string;
  reasonOtherText: string | null;
  notes: string | null;
  initiatedByType: string;
  initiatedById: string | null;
  requestedRefundAmount: number;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  itemReturnedById: string | null;
  itemReturnedAt: string | null;
  refundMethod: string | null;
  refundReference: string | null;
  refundProcessedById: string | null;
  refundProcessedAt: string | null;
  refundFailedReason: string | null;
  refundFailedAt: string | null;
  walletTransactionId: string | null;
  cancelledById: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    orderItemId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    allocatedDiscountPerUnit: number;
    refundableAmount: number;
    condition: string | null;
    lossDamageRecordId: string | null;
  }[];
  // Rollup across items[] — how much of this return's quantity went back
  // into sellable stock vs. a linked LossDamageRecord. All zero until
  // "Mark Item Returned" sets each item's condition.
  inventoryAction: { restockedQuantity: number; damagedQuantity: number };
  statusEvents: { id: string; status: string; changedAt: string; changedBy: string | null; note: string | null }[];
  evidencePhotos: { id: string; url: string; uploadedByType: string; uploadedById: string | null; createdAt: string }[];
  order: {
    id: string;
    billNumber: string;
    customerName: string | null;
    customerPhone: string | null;
    status: string;
    grandTotal: number;
    discountedTotal: number | null;
    paidAmount: number | null;
  };
};

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export type CustomerReturnDetailPayload = Omit<ReturnDetailPayload, "statusEvents"> & {
  statusEvents: { id: string; status: string; changedAt: string; note: string | null }[];
};

/** Full internal detail — admin/staff only. */
export function toReturnDetailPayload(r: ReturnRequestDetail): ReturnDetailPayload {
  return {
    id: r.id,
    shopId: r.shopId,
    orderId: r.orderId,
    customerId: r.customerId,
    status: r.status,
    reason: r.reason,
    reasonOtherText: r.reasonOtherText,
    notes: r.notes,
    initiatedByType: r.initiatedByType,
    initiatedById: r.initiatedById,
    requestedRefundAmount: Number(r.requestedRefundAmount),
    approvedById: r.approvedById,
    approvedAt: iso(r.approvedAt),
    rejectedById: r.rejectedById,
    rejectedAt: iso(r.rejectedAt),
    rejectionReason: r.rejectionReason,
    itemReturnedById: r.itemReturnedById,
    itemReturnedAt: iso(r.itemReturnedAt),
    refundMethod: r.refundMethod,
    refundReference: r.refundReference,
    refundProcessedById: r.refundProcessedById,
    refundProcessedAt: iso(r.refundProcessedAt),
    refundFailedReason: r.refundFailedReason,
    refundFailedAt: iso(r.refundFailedAt),
    walletTransactionId: r.walletTransactionId,
    cancelledById: r.cancelledById,
    cancelledAt: iso(r.cancelledAt),
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    items: r.items.map((i) => ({
      id: i.id,
      orderItemId: i.orderItemId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      allocatedDiscountPerUnit: Number(i.allocatedDiscountPerUnit),
      refundableAmount: Number(i.refundableAmount),
      condition: i.condition,
      lossDamageRecordId: i.lossDamageRecord?.id ?? null,
    })),
    inventoryAction: {
      restockedQuantity: r.items.filter((i) => i.condition === "RESELLABLE").reduce((sum, i) => sum + i.quantity, 0),
      damagedQuantity: r.items
        .filter((i) => i.condition != null && i.condition !== "RESELLABLE")
        .reduce((sum, i) => sum + i.quantity, 0),
    },
    statusEvents: r.statusEvents.map((e) => ({
      id: e.id,
      status: e.status,
      changedAt: e.changedAt.toISOString(),
      changedBy: e.changedBy,
      note: e.note,
    })),
    evidencePhotos: r.evidencePhotos.map((p) => ({
      id: p.id,
      url: p.url,
      uploadedByType: p.uploadedByType,
      uploadedById: p.uploadedById,
      createdAt: p.createdAt.toISOString(),
    })),
    order: {
      id: r.order.id,
      billNumber: r.order.billNumber,
      customerName: r.order.customerName,
      customerPhone: r.order.customerPhone,
      status: r.order.status,
      grandTotal: Number(r.order.grandTotal),
      discountedTotal: r.order.discountedTotal != null ? Number(r.order.discountedTotal) : null,
      paidAmount: r.order.paidAmount != null ? Number(r.order.paidAmount) : null,
    },
  };
}

/**
 * Customer-safe variant — strips internal admin/staff actor-id strings
 * (approvedById, changedBy, etc.), same posture as toOrderEvent stripping
 * OrderStatusEvent.changedBy before it reaches a customer.
 */
export function toCustomerReturnDetailPayload(r: ReturnRequestDetail): CustomerReturnDetailPayload {
  const full = toReturnDetailPayload(r);
  return {
    ...full,
    initiatedById: null,
    approvedById: null,
    rejectedById: null,
    itemReturnedById: null,
    refundProcessedById: null,
    cancelledById: null,
    statusEvents: full.statusEvents.map(({ id, status, changedAt, note }) => ({ id, status, changedAt, note })),
    evidencePhotos: full.evidencePhotos.map((p) => ({ ...p, uploadedById: null })),
  };
}
