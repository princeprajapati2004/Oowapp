import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";

export async function getBusinessById(id: string) {
  const shop = await db.shop.findUnique({
    where: { id },
    include: {
      admin: { select: { email: true, createdAt: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { products: true, categories: true, orders: true } },
    },
  });
  if (!shop) throw new NotFoundError("Business not found");
  return shop;
}

export async function suspendBusiness(id: string, reason: string) {
  const shop = await db.shop.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!shop) throw new NotFoundError("Business not found");

  return db.shop.update({
    where: { id },
    data: {
      status: "SUSPENDED",
      suspendedAt: new Date(),
      suspendedReason: reason,
    },
  });
}

export async function activateBusiness(id: string) {
  const shop = await db.shop.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!shop) throw new NotFoundError("Business not found");

  return db.shop.update({
    where: { id },
    data: {
      status: "ACTIVE",
      suspendedAt: null,
      suspendedReason: null,
    },
  });
}

export async function softDeleteBusiness(id: string) {
  const shop = await db.shop.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!shop) throw new NotFoundError("Business not found");

  return db.shop.update({
    where: { id },
    data: {
      status: "DELETED",
      deletedAt: new Date(),
      isPublished: false,
    },
  });
}
