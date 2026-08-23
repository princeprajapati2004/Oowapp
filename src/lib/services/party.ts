import { db } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/lib/api-utils";
import type { PartyInput, PartyPaymentInput } from "@/lib/validation/party";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

const UNPAID_METHODS = new Set<string | null>([null, "PENDING"]);

function orderAmount(order: { grandTotal: unknown; discountedTotal: unknown }) {
  return Number(order.discountedTotal ?? order.grandTotal);
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
      orders: { select: { grandTotal: true, discountedTotal: true, paymentMethod: true } },
      payments: true,
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
      .filter((o) => UNPAID_METHODS.has(o.paymentMethod))
      .reduce((sum, o) => sum + orderAmount(o), 0);
    const received = payments.filter((p) => p.direction === "RECEIVED").reduce((s, p) => s + Number(p.amount), 0);
    const paid = payments.filter((p) => p.direction === "PAID").reduce((s, p) => s + Number(p.amount), 0);

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

export async function getPartyStatement(shopId: string, id: string) {
  const partyWithRelations = await db.party.findFirst({
    where: { id, shopId },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { items: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!partyWithRelations) throw new NotFoundError("Party not found");
  const { orders, payments, ...party } = partyWithRelations;

  const unpaidOrderTotal = orders
    .filter((o) => UNPAID_METHODS.has(o.paymentMethod))
    .reduce((sum, o) => sum + orderAmount(o), 0);
  const received = payments.filter((p) => p.direction === "RECEIVED").reduce((s, p) => s + Number(p.amount), 0);
  const paid = payments.filter((p) => p.direction === "PAID").reduce((s, p) => s + Number(p.amount), 0);

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
      totalPaid: party.type === "SUPPLIER" ? paid : received,
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
