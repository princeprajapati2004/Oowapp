/**
 * Shared, server-side-filtered return/refund query used by both the owner
 * Returns & Refunds list page's initial RSC load and GET /api/admin/returns
 * — mirrors src/lib/services/order-search.ts's shape/conventions exactly
 * (keyset pagination on (createdAt, id), same buildWhere-then-findMany
 * structure) so the two never drift apart.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ReturnStatus } from "@/generated/prisma/enums";
import { toReturnEvent, type ReturnEventPayload } from "@/lib/server/order-events";

export type ReturnSearchFilters = {
  search?: string;
  status?: string;
  orderId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  pageSize?: number;
};

export type ReturnSearchResult = {
  returns: ReturnEventPayload[];
  nextCursor: string | null;
  hasMore: boolean;
};

const RETURN_INCLUDE = {
  order: { select: { billNumber: true, customerName: true, customerPhone: true } },
  items: { select: { productName: true, quantity: true } },
} satisfies Prisma.ReturnRequestInclude;

function buildWhere(shopId: string, filters: ReturnSearchFilters): Prisma.ReturnRequestWhereInput {
  const and: Prisma.ReturnRequestWhereInput[] = [{ shopId }];

  const search = filters.search?.trim();
  if (search) {
    and.push({
      OR: [
        { id: { contains: search } },
        { order: { billNumber: { contains: search } } },
        { order: { customerName: { contains: search } } },
        { order: { customerPhone: { contains: search } } },
      ],
    });
  }

  if (filters.status && filters.status !== "ALL") {
    and.push({ status: filters.status as ReturnStatus });
  }

  if (filters.orderId) {
    and.push({ orderId: filters.orderId });
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      and.push({ createdAt: { lte: to } });
    }
  }

  if (filters.cursor) {
    const [ts, id] = filters.cursor.split("_");
    const cursorDate = new Date(Number(ts));
    if (!Number.isNaN(cursorDate.getTime()) && id) {
      and.push({
        OR: [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: id } },
        ],
      });
    }
  }

  return { AND: and };
}

export async function searchReturns(shopId: string, filters: ReturnSearchFilters): Promise<ReturnSearchResult> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);
  const where = buildWhere(shopId, filters);

  const rows = await db.returnRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: RETURN_INCLUDE,
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt.getTime()}_${last.id}` : null;

  return {
    returns: page.map((r) => toReturnEvent(r)),
    nextCursor,
    hasMore,
  };
}

export type ReturnSummary = {
  totalReturns: number;
  pendingRefunds: number;
  totalRefunded: number;
  thisMonthRefunded: number;
};

const PENDING_REFUND_STATUSES: ReturnStatus[] = ["RETURN_REQUESTED", "RETURN_APPROVED", "ITEM_RETURNED", "REFUND_PENDING", "REFUND_PROCESSING"];

export async function getReturnSummary(shopId: string): Promise<ReturnSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalReturns, pendingRefunds, refundedAgg, monthRefundedAgg] = await Promise.all([
    db.returnRequest.count({ where: { shopId } }),
    db.returnRequest.count({ where: { shopId, status: { in: PENDING_REFUND_STATUSES } } }),
    db.returnRequest.aggregate({ where: { shopId, status: "REFUNDED" }, _sum: { requestedRefundAmount: true } }),
    db.returnRequest.aggregate({
      where: { shopId, status: "REFUNDED", refundProcessedAt: { gte: monthStart } },
      _sum: { requestedRefundAmount: true },
    }),
  ]);

  return {
    totalReturns,
    pendingRefunds,
    totalRefunded: Number(refundedAgg._sum.requestedRefundAmount ?? 0),
    thisMonthRefunded: Number(monthRefundedAgg._sum.requestedRefundAmount ?? 0),
  };
}
