import { Prisma } from "@/generated/prisma/client";
import { calculateBill, mergeLineItems, type BillLineItem, type BillTax, type BillTotals } from "@/lib/services/billing";

export class BillAlreadyRequestedError extends Error {
  constructor(message = "Bill already requested for this table. Please ask staff before ordering more.") {
    super(message);
    this.name = "BillAlreadyRequestedError";
  }
}

export const OPEN_STATUSES = ["ACTIVE", "AWAITING_PAYMENT"] as const;

export type SessionOrderLike = {
  status: string;
  items: {
    productId: string | null;
    name: string;
    price: number | Prisma.Decimal;
    quantity: number;
    categoryId?: string;
  }[];
};

/** Merges items across every non-cancelled order in a session into single bill lines. */
export function mergeSessionItems(orders: SessionOrderLike[]): BillLineItem[] {
  const items = orders
    .filter((order) => order.status !== "CANCELLED")
    .flatMap((order) =>
      order.items.map((item) => ({
        id: item.productId ?? item.name,
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity,
        categoryId: item.categoryId ?? "",
      }))
    );
  return mergeLineItems(items);
}

export function computeSessionBill(orders: SessionOrderLike[], taxes: BillTax[]): BillTotals {
  return calculateBill(mergeSessionItems(orders), taxes);
}

/**
 * Derived display label for the admin Tables board — not a persisted field.
 * "Preparing"/"Served" are computed from the session's child order tickets
 * rather than tracked as their own TableSessionStatus value, so kitchen/
 * counter's existing per-order OrderStatus machine stays the single source
 * of truth for ticket state.
 */
export function deriveSessionLabel(
  status: string,
  orders: { status: string }[]
): "Preparing" | "Served" | "Awaiting payment" | "Paid" {
  if (status === "PAID") return "Paid";
  if (status === "AWAITING_PAYMENT") return "Awaiting payment";
  const active = orders.filter((o) => o.status !== "CANCELLED");
  if (active.length === 0) return "Preparing";
  const allDone = active.every((o) => o.status === "READY" || o.status === "COMPLETED");
  return allDone ? "Served" : "Preparing";
}

/**
 * Race-safe find-or-create for a table's active session. Must run inside the
 * same db.$transaction as the order creation that calls it. The partial
 * unique index on (shopId, tableNumber) WHERE status <> 'PAID' (added by hand
 * to the generated migration — Prisma has no partial-unique-index syntax) is
 * the real correctness guarantee for concurrent submissions/double QR scans;
 * the find-then-create here is just the happy path, with P2002 handled by
 * re-querying for the row the other concurrent request just created.
 */
export async function resolveOrCreateSession(
  tx: Prisma.TransactionClient,
  args: {
    shopId: string;
    tableNumber: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerId?: string | null;
  }
) {
  const existing = await tx.tableSession.findFirst({
    where: { shopId: args.shopId, tableNumber: args.tableNumber, status: { in: [...OPEN_STATUSES] } },
  });
  if (existing) {
    if (existing.status === "AWAITING_PAYMENT") throw new BillAlreadyRequestedError();
    return existing;
  }

  try {
    return await tx.tableSession.create({
      data: {
        shopId: args.shopId,
        tableNumber: args.tableNumber,
        customerName: args.customerName || null,
        customerPhone: args.customerPhone || null,
        customerId: args.customerId ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await tx.tableSession.findFirst({
        where: { shopId: args.shopId, tableNumber: args.tableNumber, status: { in: [...OPEN_STATUSES] } },
      });
      if (winner) {
        if (winner.status === "AWAITING_PAYMENT") throw new BillAlreadyRequestedError();
        return winner;
      }
    }
    throw err;
  }
}

export type TableManualState = "RESERVED" | "CLEANING" | "DISABLED";

export type TableBoardEntry = {
  tableNumber: string;
  occupied: boolean;
  session: {
    id: string;
    status: string;
    label: "Preparing" | "Served" | "Awaiting payment" | "Paid";
    orderCount: number;
    grandTotal: number;
    createdAt: string;
    billRequestedAt: string | null;
    customerName: string | null;
    guestCount: number | null;
  } | null;
  // Staff-set state (Reserved/Cleaning/Disabled) — only meaningful when not
  // occupied; an active session's own status always takes visual priority.
  manualState: TableManualState | null;
  manualStateNote: string | null;
};

/** Combines the shop's configured table names with any open sessions — including sessions for tables not in the configured list, so a mismatched/typo'd table number doesn't silently disappear from the board. */
export function buildTableBoard(
  configuredTables: string[],
  openSessions: {
    id: string;
    tableNumber: string;
    status: string;
    createdAt: Date;
    billRequestedAt: Date | null;
    customerName: string | null;
    guestCount: number | null;
    orders: SessionOrderLike[];
  }[],
  taxes: BillTax[],
  manualStates: { tableNumber: string; state: TableManualState; note: string | null }[] = []
): TableBoardEntry[] {
  const sessionByTable = new Map(openSessions.map((s) => [s.tableNumber, s]));
  const stateByTable = new Map(manualStates.map((s) => [s.tableNumber, s]));
  const seen = new Set<string>();
  const entries: TableBoardEntry[] = [];

  for (const tableNumber of configuredTables) {
    seen.add(tableNumber);
    const session = sessionByTable.get(tableNumber);
    entries.push(toBoardEntry(tableNumber, session, taxes, stateByTable.get(tableNumber)));
  }
  for (const session of openSessions) {
    if (seen.has(session.tableNumber)) continue;
    entries.push(toBoardEntry(session.tableNumber, session, taxes, stateByTable.get(session.tableNumber)));
  }
  return entries;
}

function toBoardEntry(
  tableNumber: string,
  session:
    | {
        id: string;
        tableNumber: string;
        status: string;
        createdAt: Date;
        billRequestedAt: Date | null;
        customerName: string | null;
        guestCount: number | null;
        orders: SessionOrderLike[];
      }
    | undefined,
  taxes: BillTax[],
  manualState: { state: TableManualState; note: string | null } | undefined
): TableBoardEntry {
  if (!session) {
    return {
      tableNumber,
      occupied: false,
      session: null,
      manualState: manualState?.state ?? null,
      manualStateNote: manualState?.note ?? null,
    };
  }
  const bill = computeSessionBill(session.orders, taxes);
  return {
    tableNumber,
    occupied: true,
    session: {
      id: session.id,
      status: session.status,
      label: deriveSessionLabel(session.status, session.orders),
      orderCount: session.orders.filter((o) => o.status !== "CANCELLED").length,
      grandTotal: bill.grandTotal,
      createdAt: session.createdAt.toISOString(),
      billRequestedAt: session.billRequestedAt?.toISOString() ?? null,
      customerName: session.customerName,
      guestCount: session.guestCount,
    },
    manualState: null,
    manualStateNote: null,
  };
}
