import type { Product, Category, Tax, Shop } from "@/generated/prisma/client";

export type CustomerProduct = Omit<Product, "price"> & { price: number };
export type CustomerTax = Omit<Tax, "value"> & { value: number };
export type CustomerCategory = Category;

// Narrow DTO — only the fields customer-facing components actually use.
// Sensitive internal fields (adminId, gstNumber, lifecycle timestamps, saveOrdersToDb, etc.)
// are excluded so they are never serialised into the RSC payload sent to the browser.
export type CustomerShop = Pick<
  Shop,
  | "slug"
  | "businessName"
  | "logoUrl"
  | "address"
  | "phone"
  | "currency"
  | "whatsappNumber"
  | "requireCustomerName"
  | "requirePhone"
  | "enableTableNumber"
  | "requireTableNumber"
  | "requireDeliveryAddress"
  | "allowNotes"
  | "upiId"
  | "acceptCash"
  | "bankAccountNumber"
  | "bankName"
  | "bankIfsc"
  | "paymentQrImageUrl"
>;
