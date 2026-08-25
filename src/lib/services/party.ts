import { db } from "@/lib/db";
import { NotFoundError, ConflictError, PaymentSettlementError } from "@/lib/api-utils";
import { recomputePaymentStatus } from "@/lib/services/order-payment-status";
import type { PartyInput, PartyPaymentInput } from "@/lib/validation/party";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

// An order is outstanding based on its real payment status/amount, never
// the free-text paymentMethod field — a PARTIALLY_PAID order still has
// paymentMethod set to whatever was used for the partial payment (e.g.
// "CASH"), so a method-based check silently drops it from "outstanding"
// the moment ANY payment (even a partial one) is recorded on it.
const OUTSTANDING_STATUSES = new Set(["PENDING", "PARTIALLY_PAID"]);

function orderAmount(order: { grandTotal: unknown; discountedTotal: unknown }) {
  return Number(order.discountedTotal ?? order.grandTotal);
}

function orderOutstanding(order: { grandTotal: unknown; discountedTotal: unknown; paidAmount: unknown }) {
  return Math.max(0, orderAmount(order) - Number(order.paidAmount ?? 0));
}

function isOutstandingOrder(order: { status: string; paymentStatus: string | null }) {
  return order.status !== "CANCELLED" && OUTSTANDING_STATUSES.has(order.paymentStatus ?? "PENDING");
}

type PaymentWithAllocations = { direction: string; amount: unknown; allocations: unknown[] };

// Sums every RECEIVED/PAID payment regardless of whether it settled specific
// orders — for "how much has this party paid us in total" display figures.
function sumPayments(payments: PaymentWithAllocations[], direction: "RECEIVED" | "PAID") {
  return payments.filter((p) => p.direction === direction).reduce((s, p) => s + Number(p.amount), 0);
}

// Same, but only counting payments with no PaymentAllocation rows — for the
// outstanding-balance formula, which must not double-subtract a settlement
// payment whose effect is already reflected in the (paidAmount-netted)
// unpaidOrderTotal above.
function paymentsReceivedUnallocated(payments: PaymentWithAllocations[]) {
  return payments
    .filter((p) => p.direction === "RECEIVED" && p.allocations.length === 0)
    .reduce((s, p) => s + Number(p.amount), 0);
}
function paymentsPaidUnallocated(payments: PaymentWithAllocations[]) {
  return payments
    .filter((p) => p.direction === "PAID" && p.allocations.length === 0)
    .reduce((s, p) => s + Number(p.amount), 0);
}

async function assertUniquePhoneAndGst(
  shopId: string,
  input: { phone: string; gstNumber?: string | null },
  excludeId?: string
) {
  const [phoneClash, gstClash] = await Promise.all([
    db.party.findFirst({ where: { shopId, phone: input.phone, id: excludeId ? { not: excludeId } : undefined } }),
    input.gstNumber
      ? db.party.findFirst({ where: { shopId, gstNumber: input.gstNumber, id: excludeId ? { not: excludeId } : undefined } })
      : null,
  ]);
  if (phoneClash) throw new ConflictError("A party with this phone number already exists");
  if (gstClash) throw new ConflictError("A party with this GST number already exists");
}

async function assertOwnedParty(shopId: string, id: string) {
  const party = await db.party.findFirst({ where: { id, shopId } });
  if (!party) throw new NotFoundError("Party not found");
  return party;
}

/**
 * "You Gave / You Got" ledger convention (Khatabook/Vyapar-style):
 * - Customer: what THEY owe the shop. Unpaid matched orders add to it;
 *   RECEIVED payments (money taken in) reduce it; PAID payments (a refund
 *   or advance given back) increase it.
 * - Supplier: what the SHOP owes them. No orders are linked (suppliers
 *   don't place orders in this app). PAID payments (settling up) reduce it;
 *   RECEIVED payments (credit/goods taken from them) increase it.
 * This is intentionally a mirror image between the two party types, not an
 * inconsistency — "outstanding" means a different side of the ledger for each.
 */
function computeOutstanding(
  party: { type: string; openingBalance: unknown },
  unpaidOrderTotal: number,
  received: number,
  paid: number
) {
  const opening = Number(party.openingBalance);
  if (party.type === "SUPPLIER") {
    return opening - paid + received;
  }
  return opening + unpaidOrderTotal - received + paid;
}

export async function listPartiesWithBalances(shopId: string) {
  const parties = await db.party.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    include: {
      // Real FK relation (Order.partyId) — see findOrCreatePartyForOrder.
      // Every order that has a phone number gets linked here at creation
      // time; historical orders were backfilled the same way, so this is
      // now the authoritative source instead of a phone-string join.
      orders: { select: { grandTotal: true, discountedTotal: true, paidAmount: true, status: true, paymentStatus: true } },
      payments: { include: { allocations: { select: { id: true } } } },
    },
  });
  if (parties.length === 0) return [];

  return parties.map((partyWithRelations) => {
    // Destructuring (not `{ ...party, key: newValue }`) is required here —
    // spreading a naked Prisma result and overriding a key produces an
    // intersection of old and new key types instead of replacing it, so the
    // raw Decimal-bearing `orders`/`payments` arrays would otherwise leak
    // into the returned shape as well as the derived summary fields.
    const { orders, payments, ...party } = partyWithRelations;
    const unpaidOrderTotal = orders
      .filter(isOutstandingOrder)
      .reduce((sum, o) => sum + orderOutstanding(o), 0);
    // A settlement payment (one with PaymentAllocation rows) already reduced
    // unpaidOrderTotal above via the orders' own paidAmount — counting it
    // again here would subtract the same money twice. Only a plain,
    // order-unlinked ledger entry (a generic advance/refund) belongs in
    // this sum; totalPaid below still reports every payment either way.
    const received = paymentsReceivedUnallocated(payments);
    const paid = paymentsPaidUnallocated(payments);

    return {
      ...party,
      openingBalance: Number(party.openingBalance),
      creditLimit: party.creditLimit !== null ? Number(party.creditLimit) : null,
      createdAt: party.createdAt.toISOString(),
      updatedAt: party.updatedAt.toISOString(),
      orderCount: orders.length,
      outstanding: computeOutstanding(party, unpaidOrderTotal, received, paid),
    };
  });
}

// Lightweight list for pickers (e.g. the Expense vendor selector) — no
// balance computation, so it's cheap to call from any admin page.
export async function listPartiesForPicker(shopId: string) {
  return db.party.findMany({
    where: { shopId },
    select: { id: true, name: true, phone: true, type: true },
    orderBy: { name: "asc" },
  });
}

export async function getPartyStatement(shopId: string, id: string) {
  const partyWithRelations = await db.party.findFirst({
    where: { id, shopId },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { items: true } },
      payments: { orderBy: { createdAt: "desc" }, include: { allocations: { select: { id: true } } } },
    },
  });
  if (!partyWithRelations) throw new NotFoundError("Party not found");
  const { orders, payments, ...party } = partyWithRelations;

  const unpaidOrderTotal = orders
    .filter(isOutstandingOrder)
    .reduce((sum, o) => sum + orderOutstanding(o), 0);
  // See the matching comment in listPartiesWithBalances — only unallocated
  // payments count toward the outstanding formula; totalPaid below reports
  // every payment regardless.
  const received = paymentsReceivedUnallocated(payments);
  const paid = paymentsPaidUnallocated(payments);

  return {
    party: {
      ...party,
      openingBalance: Number(party.openingBalance),
      creditLimit: party.creditLimit !== null ? Number(party.creditLimit) : null,
      createdAt: party.createdAt.toISOString(),
      updatedAt: party.updatedAt.toISOString(),
    },
    orders: orders.map((o) => ({
      id: o.id,
      billNumber: o.billNumber,
      createdAt: o.createdAt.toISOString(),
      subtotal: Number(o.subtotal),
      taxTotal: Number(o.taxTotal),
      grandTotal: Number(o.grandTotal),
      discountedTotal: o.discountedTotal !== null ? Number(o.discountedTotal) : null,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      paidAmount: o.paidAmount !== null ? Number(o.paidAmount) : null,
      outstanding: orderOutstanding(o),
      status: o.status,
      itemCount: o.items.length,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      direction: p.direction,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    })),
    summary: {
      outstanding: computeOutstanding(party, unpaidOrderTotal, received, paid),
      totalPaid: party.type === "SUPPLIER" ? sumPayments(payments, "PAID") : sumPayments(payments, "RECEIVED"),
      orderCount: orders.length,
    },
  };
}

export async function createParty(shopId: string, input: PartyInput) {
  await assertUniquePhoneAndGst(shopId, input);
  const party = await db.party.create({
    data: {
      shopId,
      type: input.type,
      name: input.name,
      phone: input.phone,
      gstNumber: input.gstNumber || null,
      businessName: input.businessName || null,
      address: input.address || null,
      category: input.category,
      openingBalance: input.openingBalance,
      creditLimit: input.creditLimit ?? null,
      notes: input.notes || null,
    },
  });
  return {
    ...party,
    openingBalance: Number(party.openingBalance),
    creditLimit: party.creditLimit !== null ? Number(party.creditLimit) : null,
  };
}

export async function updateParty(shopId: string, id: string, input: Partial<PartyInput>) {
  await assertOwnedParty(shopId, id);
  if (input.phone || input.gstNumber !== undefined) {
    await assertUniquePhoneAndGst(
      shopId,
      { phone: input.phone ?? (await db.party.findUniqueOrThrow({ where: { id } })).phone, gstNumber: input.gstNumber },
      id
    );
  }
  const party = await db.party.update({
    where: { id },
    data: {
      ...(input.type !== undefined && { type: input.type }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.gstNumber !== undefined && { gstNumber: input.gstNumber || null }),
      ...(input.businessName !== undefined && { businessName: input.businessName || null }),
      ...(input.address !== undefined && { address: input.address || null }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.openingBalance !== undefined && { openingBalance: input.openingBalance }),
      ...(input.creditLimit !== undefined && { creditLimit: input.creditLimit ?? null }),
      ...(input.notes !== undefined && { notes: input.notes || null }),
    },
  });
  return {
    ...party,
    openingBalance: Number(party.openingBalance),
    creditLimit: party.creditLimit !== null ? Number(party.creditLimit) : null,
  };
}

export async function deleteParty(shopId: string, id: string) {
  await assertOwnedParty(shopId, id);
  await db.party.delete({ where: { id } });
}

export async function createPartyPayment(
  shopId: string,
  partyId: string,
  createdBy: string,
  input: PartyPaymentInput
) {
  await assertOwnedParty(shopId, partyId);
  const payment = await db.partyPayment.create({
    data: {
      shopId,
      partyId,
      amount: input.amount,
      method: input.method,
      direction: input.direction,
      note: input.note || null,
      createdBy,
    },
  });
  return { ...payment, amount: Number(payment.amount) };
}

/**
 * Settles one or more of a party's outstanding orders with a single
 * payment — creates one PartyPayment (the ledger line the statement
 * already renders), a PaymentAllocation row per order it actually touched,
 * and a PaymentRecord + recomputed paidAmount/paymentStatus on each of
 * those orders, exactly like the existing single-order mark_paid action
 * already does. Real cash (`input.amount`) is applied first, oldest order
 * first; any remaining discount is then applied the same way to whatever's
 * still outstanding. Everything — the "what's actually outstanding right
 * now" read included — happens inside one transaction so a concurrent
 * change to the same orders can't be read stale and then silently
 * overwritten.
 */
export async function settlePartyPayment(
  shopId: string,
  partyId: string,
  createdBy: string,
  input: {
    amount: number;
    discount?: number;
    method: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
    note?: string;
    orderIds?: string[];
  }
) {
  await assertOwnedParty(shopId, partyId);
  const discount = input.discount ?? 0;

  return db.$transaction(async (tx) => {
    const allOrders = await tx.order.findMany({
      where: { shopId, partyId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "asc" }, // oldest first = FIFO default
    });
    let targetOrders = allOrders.filter(isOutstandingOrder);
    if (input.orderIds && input.orderIds.length > 0) {
      const idSet = new Set(input.orderIds);
      targetOrders = targetOrders.filter((o) => idSet.has(o.id));
    }
    if (targetOrders.length === 0) {
      throw new PaymentSettlementError("No outstanding orders to settle for this party.");
    }

    const totalOutstanding = targetOrders.reduce((s, o) => s + orderOutstanding(o), 0);
    if (input.amount + discount > totalOutstanding + 0.005) {
      throw new PaymentSettlementError(
        `Payment plus discount (${(input.amount + discount).toFixed(2)}) exceeds the outstanding amount (${totalOutstanding.toFixed(2)}) for the selected invoice(s).`
      );
    }

    // Real cash first, oldest order first; any leftover discount then
    // covers whatever's still outstanding, same order.
    const allocations: { orderId: string; cashPortion: number; discountPortion: number }[] = [];
    let remainingCash = input.amount;
    let remainingDiscount = discount;
    for (const order of targetOrders) {
      if (remainingCash <= 0.005 && remainingDiscount <= 0.005) break;
      const outstanding = orderOutstanding(order);
      if (outstanding <= 0.005) continue;
      const cashPortion = Math.min(remainingCash, outstanding);
      remainingCash -= cashPortion;
      const discountPortion = Math.min(remainingDiscount, outstanding - cashPortion);
      remainingDiscount -= discountPortion;
      if (cashPortion > 0.005 || discountPortion > 0.005) {
        allocations.push({ orderId: order.id, cashPortion, discountPortion });
      }
    }

    const partyPayment = await tx.partyPayment.create({
      data: {
        shopId,
        partyId,
        amount: input.amount,
        discountAmount: discount > 0 ? discount : null,
        method: input.method,
        direction: "RECEIVED",
        note: input.note || null,
        createdBy,
      },
    });

    for (const alloc of allocations) {
      const order = targetOrders.find((o) => o.id === alloc.orderId)!;
      const newPaidAmount = Number(order.paidAmount ?? 0) + alloc.cashPortion;
      const currentEffectiveTotal = orderAmount(order);
      const newDiscountedTotal =
        alloc.discountPortion > 0.005 ? Math.max(0, currentEffectiveTotal - alloc.discountPortion) : order.discountedTotal;
      const finalTotal = newDiscountedTotal != null ? Number(newDiscountedTotal) : Number(order.grandTotal);
      const paymentStatus = recomputePaymentStatus(order.paymentStatus, newPaidAmount, finalTotal);

      await tx.order.update({
        where: { id: order.id },
        data: {
          paidAmount: newPaidAmount,
          paymentMethod: input.method,
          paymentStatus,
          ...(alloc.discountPortion > 0.005
            ? {
                discountedTotal: newDiscountedTotal,
                // Only set the descriptive discount fields when the order
                // has no manual discount yet — if discountType is already
                // PERCENTAGE, discountValue is a percentage number, and
                // overwriting it with a raw currency amount here would
                // corrupt it. discountedTotal (the field that actually
                // drives every other total calculation) is set correctly
                // above regardless of this.
                ...(order.discountType === null
                  ? { discountType: "FIXED", discountValue: alloc.discountPortion, discountReason: "Payment settlement discount" }
                  : {}),
              }
            : {}),
        },
      });

      if (alloc.cashPortion > 0.005) {
        await tx.paymentRecord.create({
          data: {
            shopId,
            orderId: order.id,
            amount: alloc.cashPortion,
            method: input.method,
            note: input.note || "Party payment settlement",
            recordedBy: createdBy,
          },
        });
      }

      await tx.paymentAllocation.create({
        data: { shopId, partyPaymentId: partyPayment.id, orderId: order.id, allocatedAmount: alloc.cashPortion },
      });
    }

    return {
      ...partyPayment,
      amount: Number(partyPayment.amount),
      discountAmount: partyPayment.discountAmount != null ? Number(partyPayment.discountAmount) : null,
      ordersSettled: allocations.length,
    };
  });
}

/**
 * Find-or-create the Party this order belongs to — called inside the
 * order-creation transaction (see POST /api/orders and POST
 * /api/admin/orders) so every order, guest or logged-in, always resolves to
 * a khatabook contact via a real FK (Order.partyId), never just a phone
 * string. Returns null when there's no phone to match on (nothing to link —
 * matches the app's existing "phone is the identity" convention elsewhere,
 * e.g. Customer's own @@unique([shopId, phone])).
 *
 * A phone match against an existing Party updates that party's name to the
 * latest one used at checkout (never its other CRM-curated fields like
 * category/notes/businessName) — same "don't create a duplicate customer
 * just because the typed name varies" rule Customer profile updates follow.
 */
export async function findOrCreatePartyForOrder(
  tx: Tx,
  shopId: string,
  name: string | null | undefined,
  phone: string | null | undefined
): Promise<string | null> {
  const normalizedPhone = phone?.trim();
  if (!normalizedPhone) return null;
  const trimmedName = name?.trim();

  const existing = await tx.party.findUnique({
    where: { shopId_phone: { shopId, phone: normalizedPhone } },
  });
  if (existing) {
    if (trimmedName && trimmedName !== existing.name) {
      await tx.party.update({ where: { id: existing.id }, data: { name: trimmedName } });
    }
    return existing.id;
  }

  // Two concurrent first-time orders from the same new phone number could
  // both reach here before either commits — the @@unique([shopId, phone])
  // constraint is the real backstop, so a losing create() just falls back to
  // re-reading the row the winner created instead of erroring the order out.
  try {
    const created = await tx.party.create({
      data: { shopId, type: "CUSTOMER", name: trimmedName || "Guest", phone: normalizedPhone },
    });
    return created.id;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const raceWinner = await tx.party.findUnique({ where: { shopId_phone: { shopId, phone: normalizedPhone } } });
      return raceWinner?.id ?? null;
    }
    throw error;
  }
}
