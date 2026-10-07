import { db } from "@/lib/db";
import type { TransactionStatus } from "@/generated/prisma/client";

export interface TransactionListFilters {
  status?: TransactionStatus;
  page?: number;
  perPage?: number;
}

/** Super Admin payment/transaction audit list. */
export async function listSubscriptionTransactions(filters: TransactionListFilters = {}) {
  const { status, page = 1, perPage = 20 } = filters;
  const where = status ? { status } : {};

  const [rows, total] = await Promise.all([
    db.subscriptionTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        admin: { select: { email: true } },
        plan: { select: { name: true, code: true } },
        coupon: { select: { code: true } },
      },
    }),
    db.subscriptionTransaction.count({ where }),
  ]);

  return { rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}
