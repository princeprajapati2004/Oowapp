/**
 * Business-side stock loss (breakage/spoilage/theft/miscount), independent
 * of customer returns — see LossDamageRecord's doc comment in
 * prisma/schema.prisma. Cost-basis math follows the exact same
 * never-fabricate convention as src/lib/services/profit.ts:
 * computeUnitProfit (null costPrice -> null loss value, not an estimate).
 */
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { LossDamageType, DamageType } from "@/generated/prisma/enums";
import { NotFoundError, ReturnError } from "@/lib/api-utils";
import { round2 } from "@/lib/services/billing";

export type CreateLossDamageInput = {
  shopId: string;
  productId: string;
  quantity: number;
  type: LossDamageType;
  damageType?: DamageType | null;
  notes?: string | null;
  date?: Date;
  evidencePhotoUrls?: string[];
  clientRequestId?: string;
  createdBy: string | null;
  createdByLabel?: string | null;
  // Owner override of the auto-computed (qty * unitCost) value — see
  // effectiveLossValue() below for how this takes precedence when set.
  manualValue?: number | null;
  manualValueReason?: string | null;
};

/** The value everywhere else in the app should treat as "the" loss/damage value — the owner's manual override when set, else the auto-computed cost-basis figure. */
export function effectiveLossValue(record: {
  totalLossValue: unknown;
  manualValue: unknown;
}): number | null {
  if (record.manualValue != null) return Number(record.manualValue);
  if (record.totalLossValue != null) return Number(record.totalLossValue);
  return null;
}

const LOSS_DAMAGE_DETAIL_INCLUDE = {
  product: { select: { id: true, name: true, imageUrl: true, productCode: true } },
  returnItem: {
    select: {
      id: true,
      returnId: true,
      returnRequest: { select: { id: true, orderId: true } },
    },
  },
} satisfies Prisma.LossDamageRecordInclude;

export type LossDamageRecordDetail = Prisma.LossDamageRecordGetPayload<{ include: typeof LOSS_DAMAGE_DETAIL_INCLUDE }>;

/**
 * Creates a loss/damage record and, if the product tracks stock, deducts it
 * — both inside one db transaction, so a duplicate submit (same
 * clientRequestId) either fully applies once or not at all, never partially.
 * Stock is clamped at 0, never negative, and the before/after values are
 * snapshotted onto the record itself (no separate ledger needed).
 */
export async function createLossDamageRecord(input: CreateLossDamageInput): Promise<LossDamageRecordDetail> {
  if (input.quantity <= 0) {
    throw new ReturnError("Quantity must be at least 1");
  }
  if (input.manualValue != null && input.manualValue < 0) {
    throw new ReturnError("Manual value can't be negative");
  }
  if (input.manualValue != null && !input.manualValueReason?.trim()) {
    throw new ReturnError("A reason is required when overriding the loss/damage value");
  }

  if (input.clientRequestId) {
    const existing = await db.lossDamageRecord.findFirst({
      where: { shopId: input.shopId, clientRequestId: input.clientRequestId },
      include: LOSS_DAMAGE_DETAIL_INCLUDE,
    });
    if (existing) return existing;
  }

  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, shopId: input.shopId },
        select: { id: true, name: true, costPrice: true, stock: true },
      });
      if (!product) throw new NotFoundError("Product not found");

      const unitCost = product.costPrice != null ? Number(product.costPrice) : null;
      const totalLossValue = unitCost != null ? round2(unitCost * input.quantity) : null;

      const inventoryBefore = product.stock;
      const inventoryAfter = product.stock != null ? Math.max(0, product.stock - input.quantity) : null;

      if (inventoryAfter != null) {
        await tx.product.update({ where: { id: product.id }, data: { stock: inventoryAfter } });
      }

      return tx.lossDamageRecord.create({
        data: {
          shopId: input.shopId,
          productId: product.id,
          productName: product.name,
          quantity: input.quantity,
          type: input.type,
          damageType: input.type === "DAMAGED" ? (input.damageType ?? null) : null,
          notes: input.notes?.trim() || null,
          date: input.date ?? new Date(),
          unitCost,
          totalLossValue,
          inventoryBefore,
          inventoryAfter,
          evidencePhotoUrls: input.evidencePhotoUrls ?? [],
          clientRequestId: input.clientRequestId ?? null,
          createdBy: input.createdBy,
          createdByLabel: input.createdByLabel ?? null,
          manualValue: input.manualValue ?? null,
          manualValueReason: input.manualValue != null ? input.manualValueReason?.trim() || null : null,
        },
        include: LOSS_DAMAGE_DETAIL_INCLUDE,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && input.clientRequestId) {
      const winner = await db.lossDamageRecord.findFirst({
        where: { shopId: input.shopId, clientRequestId: input.clientRequestId },
        include: LOSS_DAMAGE_DETAIL_INCLUDE,
      });
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Auto-creates a loss/damage record from a non-RESELLABLE returned item —
 * called from inside the same guarded "Mark Item Returned" transaction (see
 * src/lib/services/return-request.ts), so it takes an already-open `tx`
 * rather than opening its own. No clientRequestId needed here: the guard
 * against double-processing is ReturnItem.condition being set exactly once
 * by that transition's own CAS check, not a separate idempotency key.
 */
export async function createLinkedLossDamageRecord(
  tx: Prisma.TransactionClient,
  args: {
    shopId: string;
    productId: string;
    returnItemId: string;
    quantity: number;
    type: LossDamageType;
    createdBy: string | null;
  }
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: args.productId },
    select: { id: true, name: true, costPrice: true, stock: true },
  });
  if (!product) return; // orderItem.productId can be null for manual/legacy lines — nothing to adjust

  const unitCost = product.costPrice != null ? Number(product.costPrice) : null;
  const totalLossValue = unitCost != null ? round2(unitCost * args.quantity) : null;
  const inventoryBefore = product.stock;
  const inventoryAfter = product.stock != null ? Math.max(0, product.stock - args.quantity) : null;

  if (inventoryAfter != null) {
    await tx.product.update({ where: { id: product.id }, data: { stock: inventoryAfter } });
  }

  await tx.lossDamageRecord.create({
    data: {
      shopId: args.shopId,
      productId: product.id,
      productName: product.name,
      quantity: args.quantity,
      type: args.type,
      notes: "Auto-created from a customer return",
      unitCost,
      totalLossValue,
      inventoryBefore,
      inventoryAfter,
      returnItemId: args.returnItemId,
      createdBy: args.createdBy,
    },
  });
}

export type LossDamageSearchFilters = {
  search?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  pageSize?: number;
};

function buildWhere(shopId: string, filters: LossDamageSearchFilters): Prisma.LossDamageRecordWhereInput {
  const and: Prisma.LossDamageRecordWhereInput[] = [{ shopId }];

  const search = filters.search?.trim();
  if (search) {
    and.push({
      OR: [
        { id: { contains: search } },
        { productName: { contains: search } },
      ],
    });
  }

  if (filters.type && filters.type !== "ALL") {
    and.push({ type: filters.type as LossDamageType });
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime())) and.push({ date: { gte: from } });
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      and.push({ date: { lte: to } });
    }
  }

  if (filters.cursor) {
    const [ts, id] = filters.cursor.split("_");
    const cursorDate = new Date(Number(ts));
    if (!Number.isNaN(cursorDate.getTime()) && id) {
      and.push({
        OR: [
          { date: { lt: cursorDate } },
          { date: cursorDate, id: { lt: id } },
        ],
      });
    }
  }

  return { AND: and };
}

export type LossDamageSearchResult = {
  records: LossDamageRecordDetail[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function searchLossDamageRecords(
  shopId: string,
  filters: LossDamageSearchFilters
): Promise<LossDamageSearchResult> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);
  const where = buildWhere(shopId, filters);

  const rows = await db.lossDamageRecord.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: LOSS_DAMAGE_DETAIL_INCLUDE,
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.date.getTime()}_${last.id}` : null;

  return { records: page, nextCursor, hasMore };
}

export type LossDamageSummary = {
  totalRecords: number;
  totalItemsLost: number;
  totalItemsDamaged: number;
  // "Lost"-type value only (LOST/WASTED/MISSING/THEFT-like) — see
  // DAMAGED_LIKE_TYPES below for the split.
  totalLossValue: number;
  // "Damaged"-type value only (DAMAGED/BROKEN/SPOILED).
  totalDamageValue: number;
  totalLossDamageValue: number;
  thisMonthLossValue: number;
};

const DAMAGED_LIKE_TYPES: LossDamageType[] = ["DAMAGED", "BROKEN", "SPOILED"];

// Manual overrides mean the effective value per record isn't a single
// column Prisma's aggregate() can sum directly (it'd need COALESCE across
// two columns) — loss/damage entries are low-volume business events (not
// order-scale), so a single findMany + in-memory reduce is the simplest
// correct option rather than raw SQL.
export async function getLossDamageSummary(shopId: string): Promise<LossDamageSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const records = await db.lossDamageRecord.findMany({
    where: { shopId },
    select: { type: true, quantity: true, totalLossValue: true, manualValue: true, date: true },
  });

  let totalItemsLost = 0;
  let totalItemsDamaged = 0;
  let totalLossValue = 0;
  let totalDamageValue = 0;
  let thisMonthLossValue = 0;

  for (const record of records) {
    const value = effectiveLossValue(record) ?? 0;
    if (DAMAGED_LIKE_TYPES.includes(record.type)) {
      totalItemsDamaged += record.quantity;
      totalDamageValue += value;
    } else {
      totalItemsLost += record.quantity;
      totalLossValue += value;
    }
    if (record.date >= monthStart) thisMonthLossValue += value;
  }

  return {
    totalRecords: records.length,
    totalItemsLost,
    totalItemsDamaged,
    totalLossValue: round2(totalLossValue),
    totalDamageValue: round2(totalDamageValue),
    totalLossDamageValue: round2(totalLossValue + totalDamageValue),
    thisMonthLossValue: round2(thisMonthLossValue),
  };
}

export type LossDamagePayload = {
  id: string;
  shopId: string;
  productId: string;
  productName: string;
  productCode: string | null;
  productImageUrl: string | null;
  quantity: number;
  type: string;
  damageType: string | null;
  notes: string | null;
  date: string;
  unitCost: number | null;
  totalLossValue: number | null;
  manualValue: number | null;
  manualValueReason: string | null;
  effectiveValue: number | null;
  inventoryBefore: number | null;
  inventoryAfter: number | null;
  evidencePhotoUrls: string[];
  returnId: string | null;
  returnOrderId: string | null;
  createdBy: string | null;
  createdByLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toLossDamagePayload(record: LossDamageRecordDetail): LossDamagePayload {
  return {
    id: record.id,
    shopId: record.shopId,
    productId: record.productId,
    productName: record.productName,
    productCode: record.product?.productCode ?? null,
    productImageUrl: record.product?.imageUrl ?? null,
    quantity: record.quantity,
    type: record.type,
    damageType: record.damageType,
    notes: record.notes,
    date: record.date.toISOString(),
    unitCost: record.unitCost != null ? Number(record.unitCost) : null,
    totalLossValue: record.totalLossValue != null ? Number(record.totalLossValue) : null,
    manualValue: record.manualValue != null ? Number(record.manualValue) : null,
    manualValueReason: record.manualValueReason,
    effectiveValue: effectiveLossValue(record),
    inventoryBefore: record.inventoryBefore,
    inventoryAfter: record.inventoryAfter,
    evidencePhotoUrls: record.evidencePhotoUrls,
    returnId: record.returnItem?.returnId ?? null,
    returnOrderId: record.returnItem?.returnRequest.orderId ?? null,
    createdBy: record.createdBy,
    createdByLabel: record.createdByLabel,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
