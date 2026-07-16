import { db } from "@/lib/db";
import { slugify, randomSuffix } from "@/lib/utils/slugify";
import { isDeliveryFirst, type BusinessType } from "@/lib/business-types";
import { NotFoundError } from "@/lib/api-utils";

async function generateUniqueSlug(businessName: string) {
  const base = slugify(businessName) || "shop";
  let slug = base;
  let attempt = 0;
  while (await db.shop.findUnique({ where: { slug }, select: { id: true } })) {
    attempt += 1;
    slug = `${base}-${randomSuffix(4)}`;
    if (attempt > 8) {
      slug = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return slug;
}

export async function createShopForAdmin(
  adminId: string,
  input: {
    businessName: string;
    businessType: BusinessType;
    whatsappNumber: string;
  }
) {
  const slug = await generateUniqueSlug(input.businessName);
  const deliveryFirst = isDeliveryFirst(input.businessType);

  return db.shop.create({
    data: {
      adminId,
      slug,
      businessName: input.businessName,
      businessType: input.businessType,
      whatsappNumber: input.whatsappNumber,
      requireTableNumber: !deliveryFirst,
      requireDeliveryAddress: deliveryFirst,
    },
  });
}

export async function getShopByAdminId(adminId: string) {
  const shop = await db.shop.findUnique({ where: { adminId } });
  if (!shop) throw new NotFoundError("Shop not found");
  return shop;
}

export async function getShopById(shopId: string) {
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new NotFoundError("Shop not found");
  return shop;
}

export type ShopSettingsInput = Partial<{
  businessName: string;
  businessType: BusinessType;
  logoUrl: string | null;
  phone: string | null;
  whatsappNumber: string;
  address: string | null;
  gstNumber: string | null;
  currency: string;
  upiId: string | null;
  acceptCash: boolean;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  paymentQrImageUrl: string | null;
  requireCustomerName: boolean;
  requirePhone: boolean;
  requireTableNumber: boolean;
  requireDeliveryAddress: boolean;
  allowNotes: boolean;
  saveOrdersToDb: boolean;
  isPublished: boolean;
}>;

export async function updateShopSettings(shopId: string, data: ShopSettingsInput) {
  return db.shop.update({ where: { id: shopId }, data });
}

export async function getPublicShopBundle(slug: string) {
  const shop = await db.shop.findUnique({
    where: { slug },
    include: {
      categories: {
        where: { isVisible: true },
        orderBy: { sortOrder: "asc" },
      },
      products: {
        where: { isVisible: true },
        orderBy: { sortOrder: "asc" },
      },
      taxes: {
        where: { isEnabled: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!shop || !shop.isPublished || shop.status !== "ACTIVE") {
    return null;
  }

  return shop;
}
