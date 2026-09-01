// Item Master — Party/customer-wise item price overrides (PartyProductPrice).
// Absence of a row for a given (party, product) just means the normal
// pricing.ts priority (wholesale-if-applicable, then base price) applies —
// see resolveItemPricing.
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";

const PARTY_SELECT = { id: true, name: true, phone: true, category: true } as const;

async function assertOwnedProduct(shopId: string, productId: string) {
  const product = await db.product.findFirst({ where: { id: productId, shopId }, select: { id: true } });
  if (!product) throw new NotFoundError("Product not found");
}

export async function listPartyPricesForProduct(shopId: string, productId: string) {
  await assertOwnedProduct(shopId, productId);
  return db.partyProductPrice.findMany({
    where: { shopId, productId },
    include: { party: { select: PARTY_SELECT } },
    orderBy: { createdAt: "asc" },
  });
}

export async function setPartyPrice(shopId: string, productId: string, partyId: string, price: number) {
  await assertOwnedProduct(shopId, productId);
  const party = await db.party.findFirst({ where: { id: partyId, shopId }, select: { id: true } });
  if (!party) throw new NotFoundError("Party not found");

  return db.partyProductPrice.upsert({
    where: { partyId_productId: { partyId, productId } },
    create: { shopId, partyId, productId, price },
    update: { price },
    include: { party: { select: PARTY_SELECT } },
  });
}

export async function removePartyPrice(shopId: string, productId: string, partyId: string) {
  await assertOwnedProduct(shopId, productId);
  const row = await db.partyProductPrice.findFirst({ where: { shopId, productId, partyId } });
  if (!row) throw new NotFoundError("Party price not found");
  await db.partyProductPrice.delete({ where: { id: row.id } });
}
