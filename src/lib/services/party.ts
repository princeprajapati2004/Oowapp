import { db } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/lib/api-utils";
import type { PartyInput, PartyPaymentInput } from "@/lib/validation/party";

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
  const parties = await db.party.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } });
  if (parties.length === 0) return [];

  const phones = [...new Set(parties.map((p) => p.phone))];
  const partyIds = parties.map((p) => p.id);

  const [orders, payments] = await Promise.all([
    db.order.findMany({
      where: { shopId, customerPhone: { in: phones } },
      select: { customerPhone: true, grandTotal: true, discountedTotal: true, paymentMethod: true },
    }),
    db.partyPayment.findMany({ where: { shopId, partyId: { in: partyIds } } }),
  ]);

  const ordersByPhone = new Map<string, typeof orders>();
  for (const order of orders) {
    if (!order.customerPhone) continue;
    const list = ordersByPhone.get(order.customerPhone) ?? [];
    list.push(order);
    ordersByPhone.set(order.customerPhone, list);
  }
  const paymentsByParty = new Map<string, typeof payments>();
  for (const payment of payments) {
    const list = paymentsByParty.get(payment.partyId) ?? [];
    list.push(payment);
    paymentsByParty.set(payment.partyId, list);
  }

  return parties.map((party) => {
    const matchedOrders = ordersByPhone.get(party.phone) ?? [];
    const unpaidOrderTotal = matchedOrders
      .filter((o) => UNPAID_METHODS.has(o.paymentMethod))
      .reduce((sum, o) => sum + orderAmount(o), 0);
    const partyPayments = paymentsByParty.get(party.id) ?? [];
    const received = partyPayments.filter((p) => p.direction === "RECEIVED").reduce((s, p) => s + Number(p.amount), 0);
    const paid = partyPayments.filter((p) => p.direction === "PAID").reduce((s, p) => s + Number(p.amount), 0);

    return {
      ...party,
      openingBalance: Number(party.openingBalance),
      creditLimit: party.creditLimit !== null ? Number(party.creditLimit) : null,
      createdAt: party.createdAt.toISOString(),
      updatedAt: party.updatedAt.toISOString(),
      orderCount: matchedOrders.length,
      outstanding: computeOutstanding(party, unpaidOrderTotal, received, paid),
    };
  });
}

export async function getPartyStatement(shopId: string, id: string) {
  const party = await assertOwnedParty(shopId, id);

  const [orders, payments] = await Promise.all([
    db.order.findMany({
      where: { shopId, customerPhone: party.phone },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    }),
    db.partyPayment.findMany({ where: { shopId, partyId: id }, orderBy: { createdAt: "desc" } }),
  ]);

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
