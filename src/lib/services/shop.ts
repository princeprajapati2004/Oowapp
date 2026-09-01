import { db } from "@/lib/db";
import { slugify, randomSuffix } from "@/lib/utils/slugify";
import { isDeliveryFirst, type BusinessType } from "@/lib/business-types";
import { NotFoundError } from "@/lib/api-utils";
import type { OrderMode, PrintFormat } from "@/generated/prisma/client";

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
      enableTableNumber: !deliveryFirst,
      requireTableNumber: !deliveryFirst,
      requireDeliveryAddress: deliveryFirst,
      // New signups go through /admin/onboarding (mobile verification +
      // business profile) — see (dashboard)/layout.tsx's redirect gate.
      // Column defaults to true so shops that existed before this flow
      // shipped are never retroactively gated out of their own dashboard.
      onboardingCompleted: false,
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
  ownerName: string | null;
  email: string | null;
  website: string | null;
  panNumber: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  timezone: string | null;
  onboardingCompleted: boolean;
  upiId: string | null;
  acceptCash: boolean;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  paymentQrImageUrl: string | null;
  paymentDisplayName: string | null;
  googlePayUpi: string | null;
  phonePeUpi: string | null;
  paytmUpi: string | null;
  bhimUpi: string | null;
  requireCustomerName: boolean;
  requirePhone: boolean;
  enableTableNumber: boolean;
  requireTableNumber: boolean;
  requireDeliveryAddress: boolean;
  allowNotes: boolean;
  saveOrdersToDb: boolean;
  isPublished: boolean;
  enableOrderBarcodeLabels: boolean;
  enableQrOrdering: boolean;
  returnPolicyEnabled: boolean;
  returnWindowDays: number;
  showProductImages: boolean;
  enableTableQr: boolean;
  tableNames: string | null;
  notifyNewOrders: boolean;
  notifyOrderUpdates: boolean;
  orderMode: OrderMode;
  billNumberPrefix: string;
  billNumberNext: number;
  printFormat: PrintFormat;
  autoPrintCompletedBill: boolean;
}>;

export async function updateShopSettings(shopId: string, data: ShopSettingsInput) {
  return db.shop.update({ where: { id: shopId }, data });
}

export async function getPublicShopBundle(slug: string) {
  const shop = await db.shop.findUnique({
    where: { slug },
    select: {
      // Public business identity
      slug: true,
      businessName: true,
      logoUrl: true,
      address: true,
      phone: true,
      currency: true,
      // Critical — where orders are sent
      whatsappNumber: true,
      // Checkout form requirements
      requireCustomerName: true,
      requirePhone: true,
      enableTableNumber: true,
      requireTableNumber: true,
      requireDeliveryAddress: true,
      allowNotes: true,
      enableTableQr: true,
      // Payment display (intentionally shown to customers)
      upiId: true,
      acceptCash: true,
      bankAccountNumber: true,
      bankName: true,
      bankIfsc: true,
      paymentQrImageUrl: true,
      paymentDisplayName: true,
      googlePayUpi: true,
      phonePeUpi: true,
      paytmUpi: true,
      bhimUpi: true,
      // Feature flags — forwarded to the customer UI
      enableQrOrdering: true,
      showProductImages: true,
      orderMode: true,
      // Gate checks — stripped before the value is returned to the caller
      isPublished: true,
      status: true,
      categories: {
        where: { isVisible: true },
        orderBy: { sortOrder: "asc" },
      },
      // isAvailable: true hides sold-out products from the customer menu entirely.
      // omit: costPrice/mrp/wholesalePrice are owner-only financial data (see
      // Product model's doc comment) and must never reach the customer-facing
      // bundle. offerType/offerValue are intentionally NOT omitted — the
      // customer-facing discount is the entire point of the offer feature.
      products: {
        where: { isVisible: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        omit: { costPrice: true, mrp: true, wholesalePrice: true },
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

  // Strip internal gate fields before forwarding to the RSC — they must not reach the browser.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isPublished: _pub, status: _status, ...publicBundle } = shop;

  return publicBundle;
}
