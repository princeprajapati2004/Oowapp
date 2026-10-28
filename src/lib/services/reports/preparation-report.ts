import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";
import { deriveOrderSource } from "@/lib/order-status";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";

export interface PreparationReportFilters {
  from: Date;
  to: Date;
  search?: string;
  source?: string; // "Manual" | "Online"
  status?: string; // one of OrderStatus
}

export interface PreparationReportRow {
  id: string;
  billNumber: string;
  date: string;
  source: string;
  status: string;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  delayMinutes: number | null;
  preparedBy: string | null;
}

export interface PreparationReportSummary {
  totalOrders: number;
  ordersWithEstimate: number;
  // null (not 0) when no order in range has an estimate yet — distinguishes
  // "no data" from "averaged to zero" per the report's own honesty rule.
  avgEstimatedMinutes: number | null;
  avgActualMinutes: number | null;
  delayedOrders: number;
  avgDelayMinutes: number | null;
  ordersByStatus: Record<string, number>;
  ordersBySource: Record<string, number>;
}

function buildWhere(shopId: string, filters: PreparationReportFilters): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [
    { shopId },
    { createdAt: { gte: filters.from, lte: filters.to } },
  ];
  if (filters.status) and.push({ status: filters.status as OrderStatus });
  if (filters.source === "Manual") and.push({ source: { in: ["waiter", "manual"] } });
  if (filters.source === "Online") and.push({ source: { notIn: ["waiter", "manual"] } });
  if (filters.search) {
    and.push({
      OR: [
        { billNumber: { contains: filters.search, ...caseInsensitive() } },
        { customerName: { contains: filters.search, ...caseInsensitive() } },
      ],
    });
  }
  return { AND: and };
}

const SELECT = {
  id: true,
  billNumber: true,
  createdAt: true,
  source: true,
  status: true,
  acceptedAt: true,
  estimatedPrepMinutes: true,
  estimatedReadyAt: true,
  actualReadyAt: true,
  prepDelayFlag: true,
  statusEvents: { where: { status: "READY" as const }, select: { changedBy: true }, take: 1 },
} satisfies Prisma.OrderSelect;

type OrderForReport = Prisma.OrderGetPayload<{ select: typeof SELECT }>;

function actualMinutesOf(order: OrderForReport): number | null {
  if (!order.acceptedAt || !order.actualReadyAt) return null;
  return Math.round((order.actualReadyAt.getTime() - order.acceptedAt.getTime()) / 60_000);
}

function delayMinutesOf(order: OrderForReport): number | null {
  if (!order.estimatedReadyAt || !order.actualReadyAt) return null;
  const diff = Math.round((order.actualReadyAt.getTime() - order.estimatedReadyAt.getTime()) / 60_000);
  return diff > 0 ? diff : null;
}

function isDelayed(order: OrderForReport): boolean {
  return order.prepDelayFlag || delayMinutesOf(order) != null;
}

/** Best-effort "who marked it ready" label — see OrderStatusEvent.changedBy / the display-token action route's "display:<id>" convention. */
async function resolvePreparedByLabels(shopId: string, changedByIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(changedByIds.filter(Boolean)));
  const labels = new Map<string, string>();
  if (unique.length === 0) return labels;

  const staffIds = unique.filter((id) => !id.startsWith("display:"));
  const [staff, admins] = await Promise.all([
    db.staffMember.findMany({ where: { id: { in: staffIds }, shopId }, select: { id: true, name: true } }),
    // Admin has no name field — a matching id just confirms "this shop's
    // owner", shown generically rather than fabricating a display name.
    db.admin.findMany({ where: { id: { in: staffIds } }, select: { id: true } }),
  ]);
  staff.forEach((s: (typeof staff)[number]) => labels.set(s.id, s.name));
  admins.forEach((a: (typeof admins)[number]) => {
    if (!labels.has(a.id)) labels.set(a.id, "Owner");
  });
  unique.forEach((id) => {
    if (!labels.has(id)) labels.set(id, id.startsWith("display:") ? "Kitchen display" : "Staff");
  });
  return labels;
}

export async function getPreparationReportSummary(shopId: string, filters: PreparationReportFilters): Promise<PreparationReportSummary> {
  const orders = await db.order.findMany({ where: buildWhere(shopId, filters), select: SELECT });

  const ordersWithEstimate = orders.filter((o: OrderForReport) => o.estimatedPrepMinutes != null);
  const avgEstimatedMinutes =
    ordersWithEstimate.length > 0
      ? Math.round(ordersWithEstimate.reduce((sum: number, o: OrderForReport) => sum + (o.estimatedPrepMinutes ?? 0), 0) / ordersWithEstimate.length)
      : null;

  const actualMinutesList = orders.map(actualMinutesOf).filter((m: number | null): m is number => m != null);
  const avgActualMinutes = actualMinutesList.length > 0 ? Math.round(actualMinutesList.reduce((a: number, b: number) => a + b, 0) / actualMinutesList.length) : null;

  const delayedOrdersList = orders.filter(isDelayed);
  const delayDurations = orders.map(delayMinutesOf).filter((m: number | null): m is number => m != null);
  const avgDelayMinutes = delayDurations.length > 0 ? Math.round(delayDurations.reduce((a: number, b: number) => a + b, 0) / delayDurations.length) : null;

  const ordersByStatus: Record<string, number> = {};
  const ordersBySource: Record<string, number> = {};
  orders.forEach((o: OrderForReport) => {
    ordersByStatus[o.status] = (ordersByStatus[o.status] ?? 0) + 1;
    const source = deriveOrderSource(o);
    ordersBySource[source] = (ordersBySource[source] ?? 0) + 1;
  });

  return {
    totalOrders: orders.length,
    ordersWithEstimate: ordersWithEstimate.length,
    avgEstimatedMinutes,
    avgActualMinutes,
    delayedOrders: delayedOrdersList.length,
    avgDelayMinutes,
    ordersByStatus,
    ordersBySource,
  };
}

const EXPORT_ROW_CAP = 20_000;

export async function listPreparationReportRows(
  shopId: string,
  filters: PreparationReportFilters,
  pagination: { page: number; pageSize: number } | { all: true }
): Promise<{ rows: PreparationReportRow[]; total: number; truncated: boolean }> {
  const where = buildWhere(shopId, filters);
  const isAll = "all" in pagination;
  const skip = isAll ? undefined : (pagination.page - 1) * pagination.pageSize;
  const take = isAll ? EXPORT_ROW_CAP : pagination.pageSize;

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, select: SELECT, skip, take }),
  ]);

  const preparedByLabels = await resolvePreparedByLabels(
    shopId,
    orders.map((o: OrderForReport) => o.statusEvents[0]?.changedBy ?? "").filter(Boolean)
  );

  const rows: PreparationReportRow[] = orders.map((order: OrderForReport) => ({
    id: order.id,
    billNumber: order.billNumber,
    date: order.createdAt.toISOString(),
    source: deriveOrderSource(order),
    status: order.status,
    estimatedMinutes: order.estimatedPrepMinutes,
    actualMinutes: actualMinutesOf(order),
    delayMinutes: delayMinutesOf(order),
    preparedBy: order.statusEvents[0]?.changedBy ? preparedByLabels.get(order.statusEvents[0].changedBy) ?? null : null,
  }));

  return { rows, total, truncated: isAll && total > EXPORT_ROW_CAP };
}
