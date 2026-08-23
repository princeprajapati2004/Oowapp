import type { Product, Category, Tax, Shop } from "@/generated/prisma/client";
import type { OrderMode } from "@/generated/prisma/client";

// costPrice/mrp are owner-only financial data (see Product model's doc
// comment in schema.prisma) — omitted here too so nothing customer-facing
// can even type-check a read of them, matching the omit on the DB query in
// getPublicShopBundle.
export type CustomerProduct = Omit<Product, "price" | "costPrice" | "mrp"> & { price: number };
export type CustomerTax = Omit<Tax, "value"> & { value: number };
export type CustomerCategory = Category;

// Minimal structural shape shared by every place a table session's order
// history flows through the customer UI: the serialized server-page prop
// (serializeOrders' richer output structurally satisfies this) and the
// POST /api/orders response's toOrderEvent-based sessionOrders. Only the
// fields current-order-page.tsx / order-tracker.tsx actually read.
export type SessionOrderSnapshot = {
  status: string;
  items: {
    productId: string | null;
    name: string;
    price: number;
    quantity: number;
    categoryId?: string;
    imageUrl?: string | null;
  }[];
};

// A table's currently-open order session (see TableSession) — present only
// when the customer arrived via a `?table=` QR link and that table already
// has an ACTIVE/AWAITING_PAYMENT session. `orders` is this session's order
// history, used to render the "already on this table" locked panel and to
// compute the running total.
export type ActiveSession = {
  id: string;
  status: string;
  billRequestedAt?: string | null;
  paymentMethod?: string | null;
  orders: SessionOrderSnapshot[];
} | null;

// Narrow DTO — only the fields customer-facing components actually use.
// Sensitive internal fields (adminId, gstNumber, lifecycle timestamps, saveOrdersToDb, etc.)
// are excluded so they are never serialised into the RSC payload sent to the browser.
// Note: orderMode is added as an intersection because the generated Prisma types do not
// yet include it — run `prisma generate` after applying the migration to update them.
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
  | "requirePhoneVerification"
  | "enableTableNumber"
  | "requireTableNumber"
  | "requireDeliveryAddress"
  | "allowNotes"
  | "enableTableQr"
  | "upiId"
  | "acceptCash"
  | "bankAccountNumber"
  | "bankName"
  | "bankIfsc"
  | "paymentQrImageUrl"
  | "paymentDisplayName"
  | "googlePayUpi"
  | "phonePeUpi"
  | "paytmUpi"
  | "bhimUpi"
  | "enableQrOrdering"
  | "showProductImages"
> & { orderMode: OrderMode };
