/**
 * Shared, server-side-filtered order query used by both the admin orders
 * list page's initial RSC load and GET /api/admin/orders — one
 * implementation so the two never drift. Always scoped to a single shopId;
 * callers must have already verified the caller is that shop's admin.
 *
 * Uses keyset (cursor) pagination on (createdAt, id) rather than offset
 * pagination, so pages stay fast and stable even over years of historical
 * orders — the whole point of "search complete order history without
 * loading thousands of rows into the browser" (brief §12/§30).
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { toAdminOrderEvent, type AdminOrderEventOrder } from "@/lib/server/order-events";

export type OrderTypeFilter = "delivery" | "dine-in" | "takeaway" | "ALL";
export type OrderSourceFilter = "manual" | "online" | "ALL";

export type OrderSearchFilters = {
  search?: string;
  status?: string;
  paymentStatus?: string;
  type?: OrderTypeFilter;
  source?: OrderSourceFilter;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  pageSize?: number;
};

export type OrderSearchResult = {
  orders: AdminOrderEventOrder[];
  nextCursor: string | null;
  hasMore: boolean;
};

const ORDER_INCLUDE = {
  items: true,
  statusEvents: { orderBy: { changedAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

function buildWhere(shopId: string, filters: OrderSearchFilters): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [{ shopId }];

  const search = filters.search?.trim();
  if (search) {
    const or: Prisma.OrderWhereInput[] = [
      { billNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search, mode: "insensitive" } },
    ];
    const asNumber = Number(search);
    if (Number.isFinite(asNumber) && search !== "") {
      or.push({ tokenNumber: Math.trunc(asNumber) });
    }
    and.push({ OR: or });
  }

  if (filters.status && filters.status !== "ALL") {
    and.push({ status: filters.status as OrderStatus });
  }

  if (filters.paymentStatus && filters.paymentStatus !== "ALL") {
    and.push({ paymentStatus: filters.paymentStatus as PaymentStatus });
  }

  if (filters.type && filters.type !== "ALL") {
    if (filters.type === "delivery") {
      and.push({ deliveryAddress: { not: null } });
    } else if (filters.type === "dine-in") {
      and.push({ deliveryAddress: null, tableNumber: { not: null } });
    } else {
      and.push({ deliveryAddress: null, tableNumber: null });
    }
  }

  if (filters.source && filters.source !== "ALL") {
    and.push({ source: filters.source === "manual" ? { in: ["manual", "waiter"] } : "qr" });
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
  }
  if (filters.dateTo) {
    // Treat dateTo as inclusive of the whole day.
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

export async function searchOrders(shopId: string, filters: OrderSearchFilters): Promise<OrderSearchResult> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);
  const where = buildWhere(shopId, filters);

  const rows = await db.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: ORDER_INCLUDE,
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt.getTime()}_${last.id}` : null;

  return {
    orders: page.map((order) => toAdminOrderEvent(order)),
    nextCursor,
    hasMore,
  };
}
