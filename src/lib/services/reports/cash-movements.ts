import { db } from "@/lib/db";
import { cashBankBucket, type CashBankBucket } from "@/lib/utils/cash-bank-bucket";

/**
 * Shared 4-source cash-movement union for the Cashbook and Cash & Bank
 * reports — same "union multiple payment-source models, tag with a
 * discriminator, merge + sort in application code" technique as
 * transaction-report.ts's PaymentRecord + PartyPayment union, extended to
 * all four real cash-movement sources in the schema:
 *
 *   1. PaymentRecord   (order sale payments)                    -> IN
 *   2. PartyPayment    (khatabook payments, incl. purchase pay)  -> RECEIVED = IN, PAID = OUT
 *   3. Expense         (business expenses)                       -> OUT
 *   4. ReturnRequest   (status=REFUNDED, refundMethod != WALLET) -> OUT
 *
 * Both report service files call this SAME function rather than duplicating
 * the union — see cashbook-report.ts and cash-bank-report.ts.
 */

export type CashMovementSource = "sale_payment" | "party_payment" | "expense" | "refund";

export interface CashMovement {
  id: string;
  date: string; // ISO
  source: CashMovementSource;
  description: string; // human-readable reference (order billNumber, party name, expense name, ...)
  method: string; // raw method string
  bucket: CashBankBucket;
  direction: "IN" | "OUT";
  amount: number;
  // Only meaningful for source === "party_payment" — true when the
  // underlying PartyPayment.purchaseId is set (a supplier purchase
  // settlement), letting consumers show "Purchase Payment" instead of the
  // generic "Payment"/"Payment Received" label without a second query.
  isPurchasePayment?: boolean;
}

/**
 * Friendly "Type" label shared by the Cashbook and Cash & Bank report tables
 * — Sale / Payment Received / Payment / Purchase Payment / Expense / Refund.
 */
export function describeCashMovementType(movement: Pick<CashMovement, "source" | "direction" | "isPurchasePayment">): string {
  switch (movement.source) {
    case "sale_payment":
      return "Sale";
    case "expense":
      return "Expense";
    case "refund":
      return "Refund";
    case "party_payment":
      if (movement.isPurchasePayment) return "Purchase Payment";
      return movement.direction === "IN" ? "Payment Received" : "Payment";
  }
}

/**
 * Fetches all 4 cash-movement sources for [from, to] in parallel, tags +
 * normalizes each into a CashMovement, and returns them merged and sorted
 * ascending by date (oldest first). Callers that want newest-first (e.g. the
 * Cash & Bank report table) re-sort the result themselves rather than this
 * function guessing the caller's preferred order.
 */
export async function listCashMovements(shopId: string, from: Date, to: Date): Promise<CashMovement[]> {
  const [paymentRecords, partyPayments, expenses, refunds] = await Promise.all([
    db.paymentRecord.findMany({
      where: { shopId, createdAt: { gte: from, lte: to } },
      include: {
        order: { select: { billNumber: true, customerName: true } },
        tableSession: { select: { tableNumber: true, customerName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.partyPayment.findMany({
      where: { shopId, createdAt: { gte: from, lte: to } },
      include: { party: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.expense.findMany({
      where: { shopId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
    }),
    db.returnRequest.findMany({
      where: {
        shopId,
        status: "REFUNDED",
        refundMethod: { not: "WALLET" },
        refundProcessedAt: { gte: from, lte: to },
      },
      include: { order: { select: { billNumber: true } } },
      orderBy: { refundProcessedAt: "asc" },
    }),
  ]);

  const movements: CashMovement[] = [];

  for (const p of paymentRecords) {
    const reference = p.order
      ? `${p.order.billNumber}${p.order.customerName ? ` - ${p.order.customerName}` : ""}`
      : p.tableSession
        ? `Table ${p.tableSession.tableNumber}${p.tableSession.customerName ? ` - ${p.tableSession.customerName}` : ""}`
        : "Sale Payment";
    movements.push({
      id: `sale_payment:${p.id}`,
      date: p.createdAt.toISOString(),
      source: "sale_payment",
      description: reference,
      method: p.method,
      bucket: cashBankBucket(p.method),
      direction: "IN",
      amount: Number(p.amount),
    });
  }

  for (const pp of partyPayments) {
    movements.push({
      id: `party_payment:${pp.id}`,
      date: pp.createdAt.toISOString(),
      source: "party_payment",
      description: pp.party.name,
      method: pp.method,
      bucket: cashBankBucket(pp.method),
      direction: pp.direction === "RECEIVED" ? "IN" : "OUT",
      amount: Number(pp.amount),
      isPurchasePayment: pp.purchaseId != null,
    });
  }

  for (const e of expenses) {
    movements.push({
      id: `expense:${e.id}`,
      date: e.date.toISOString(),
      source: "expense",
      description: e.name,
      method: e.paymentMethod,
      bucket: cashBankBucket(e.paymentMethod),
      direction: "OUT",
      amount: Number(e.amount),
    });
  }

  for (const r of refunds) {
    // refundProcessedAt is guaranteed set here (filtered on it above) but
    // guarded defensively since it's a nullable column.
    if (!r.refundProcessedAt) continue;
    movements.push({
      id: `refund:${r.id}`,
      date: r.refundProcessedAt.toISOString(),
      source: "refund",
      description: r.order ? `Refund - ${r.order.billNumber}` : "Refund",
      method: r.refundMethod ?? "OTHER",
      bucket: cashBankBucket(r.refundMethod),
      direction: "OUT",
      amount: Number(r.requestedRefundAmount),
    });
  }

  movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return movements;
}
