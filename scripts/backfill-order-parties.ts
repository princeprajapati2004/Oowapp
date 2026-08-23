/**
 * One-time backfill: link every existing Order to a Party (owner-side
 * khatabook contact) via the new Order.partyId FK, the same find-or-create
 * logic new orders now use at creation time (see
 * src/lib/services/party.ts#findOrCreatePartyForOrder). Idempotent — only
 * touches orders where partyId is still null, so it's safe to re-run.
 *
 * Orders with no customerPhone are left unlinked (nothing to match on —
 * matches the app's existing "phone is the identity" convention).
 *
 * Run: npm run backfill:order-parties
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const orders = await db.order.findMany({
    where: { partyId: null, customerPhone: { not: null } },
    select: { id: true, shopId: true, customerPhone: true, customerName: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) {
    console.log("Nothing to backfill — every order with a phone number already has a party.");
    return;
  }

  // Group by (shopId, phone) — the same key Party.@@unique([shopId, phone]) uses.
  const groups = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = `${order.shopId}::${order.customerPhone}`;
    const list = groups.get(key) ?? [];
    list.push(order);
    groups.set(key, list);
  }

  let partiesCreated = 0;
  let partiesUpdated = 0;
  let ordersLinked = 0;

  for (const [, group] of groups) {
    const { shopId, customerPhone: phone } = group[0];
    // Orders within a group are already createdAt-ascending, so the last
    // non-empty name is the most recent one used at checkout — same "latest
    // name wins" rule findOrCreatePartyForOrder applies going forward.
    const latestName = [...group].reverse().find((o) => o.customerName?.trim())?.customerName?.trim();

    const existing = await db.party.findUnique({ where: { shopId_phone: { shopId, phone: phone! } } });
    let partyId: string;
    if (existing) {
      partyId = existing.id;
      if (latestName && latestName !== existing.name) {
        await db.party.update({ where: { id: existing.id }, data: { name: latestName } });
        partiesUpdated++;
      }
    } else {
      const created = await db.party.create({
        data: { shopId, type: "CUSTOMER", name: latestName || "Guest", phone: phone! },
      });
      partyId = created.id;
      partiesCreated++;
    }

    const result = await db.order.updateMany({
      where: { id: { in: group.map((o) => o.id) } },
      data: { partyId },
    });
    ordersLinked += result.count;
  }

  console.log(`Backfill complete: ${partiesCreated} parties created, ${partiesUpdated} parties renamed, ${ordersLinked} orders linked across ${groups.size} phone groups.`);

  const stillUnlinked = await db.order.count({ where: { partyId: null, customerPhone: null } });
  if (stillUnlinked > 0) {
    console.log(`${stillUnlinked} orders have no phone number and remain unlinked (nothing to match on) — expected, not an error.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
