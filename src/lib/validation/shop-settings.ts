import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/business-types";
import { CURRENCIES } from "@/lib/currencies";
import { PRINT_FORMATS, type PrintFormat } from "@/lib/types/print";

const PRINT_FORMAT_VALUES = PRINT_FORMATS.map((f) => f.value) as [PrintFormat, ...PrintFormat[]];

export const printSettingsSchema = z.object({
  printFormat: z.enum(PRINT_FORMAT_VALUES),
});
export type PrintSettingsInput = z.infer<typeof printSettingsSchema>;

export const autoPrintSettingsSchema = z.object({
  autoPrintCompletedBill: z.boolean(),
});
export type AutoPrintSettingsInput = z.infer<typeof autoPrintSettingsSchema>;

export const businessInfoSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is too short").max(100),
  businessType: z.enum(BUSINESS_TYPES),
  logoUrl: z.string().nullable().optional(),
  ownerName: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  whatsappNumber: z
    .string()
    .trim()
    .min(8, "Enter a valid WhatsApp number with country code")
    .max(20)
    .regex(/^[0-9+]+$/, "Digits only, include country code"),
  email: z.string().trim().max(150).email("Enter a valid email").optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(100).optional().or(z.literal("")),
  pincode: z
    .string()
    .trim()
    .regex(/^[0-9]{4,10}$/, "Enter a valid pincode")
    .optional()
    .or(z.literal("")),
  gstNumber: z.string().trim().max(20).optional().or(z.literal("")),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)")
    .optional()
    .or(z.literal("")),
  website: z.string().trim().max(200).url("Enter a valid URL (e.g. https://example.com)").optional().or(z.literal("")),
  currency: z.enum(CURRENCIES),
});
export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;

export const paymentSettingsSchema = z.object({
  upiId: z
    .string()
    .trim()
    .max(100)
    .refine((v) => !v || /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(v), { message: "Enter a valid UPI ID (e.g. yourshop@upi)" })
    .optional()
    .or(z.literal("")),
  paymentDisplayName: z.string().trim().max(100).optional().or(z.literal("")),
  acceptCash: z.boolean(),
  bankAccountName: z.string().trim().max(100).optional().or(z.literal("")),
  bankAccountNumber: z.string().trim().max(30).optional().or(z.literal("")),
  bankIfsc: z.string().trim().max(15).optional().or(z.literal("")),
  bankName: z.string().trim().max(100).optional().or(z.literal("")),
  paymentQrImageUrl: z.string().nullable().optional(),
  googlePayUpi: z.string().trim().max(100).optional().or(z.literal("")),
  phonePeUpi: z.string().trim().max(100).optional().or(z.literal("")),
  paytmUpi: z.string().trim().max(100).optional().or(z.literal("")),
  bhimUpi: z.string().trim().max(100).optional().or(z.literal("")),
});
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

// 1/2/3/5/7/10/15/30 cover the spec's dropdown; anything else typed in via
// "Custom" still passes as long as it's a sane positive integer.
export const RETURN_WINDOW_DAY_PRESETS = [1, 2, 3, 5, 7, 10, 15, 30] as const;

export const orderSettingsSchema = z.object({
  requireCustomerName: z.boolean(),
  requirePhone: z.boolean(),
  requirePhoneVerification: z.boolean(),
  enableTableNumber: z.boolean(),
  requireTableNumber: z.boolean(),
  requireDeliveryAddress: z.boolean(),
  allowNotes: z.boolean(),
  saveOrdersToDb: z.boolean(),
  isPublished: z.boolean(),
  enableOrderBarcodeLabels: z.boolean(),
  enableQrOrdering: z.boolean(),
  returnPolicyEnabled: z.boolean(),
  returnWindowDays: z.number().int().min(1, "Must be at least 1 day").max(365, "Must be 365 days or fewer"),
});
export type OrderSettingsInput = z.infer<typeof orderSettingsSchema>;

// Order/bill number prefix — freely re-editable, safe to resubmit anytime.
export const billNumberingSchema = z.object({
  billNumberPrefix: z.string().trim().max(10).optional().or(z.literal("")),
});
export type BillNumberingInput = z.infer<typeof billNumberingSchema>;

// Resetting the live counter is a deliberate, separate action from saving the
// prefix — kept in its own schema/endpoint so a routine settings save can
// never accidentally roll it back to a stale value.
export const billNumberResetSchema = z.object({
  billNumberNext: z.coerce.number().int().positive().max(999_999_999),
});
export type BillNumberResetInput = z.infer<typeof billNumberResetSchema>;

export const notificationSettingsSchema = z.object({
  notifyNewOrders: z.boolean(),
  notifyOrderUpdates: z.boolean(),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

export const menuSettingsSchema = z.object({
  showProductImages: z.boolean(),
});
export type MenuSettingsInput = z.infer<typeof menuSettingsSchema>;

export const restaurantSettingsSchema = z.object({
  enableTableQr: z.boolean(),
  tableNames: z.array(z.string().trim().min(1).max(50)).max(100),
  // Ordering mode: WHATSAPP (default) or DIRECT (PRO+)
  orderMode: z.enum(["WHATSAPP", "DIRECT"]),
});
export type RestaurantSettingsInput = z.infer<typeof restaurantSettingsSchema>;
