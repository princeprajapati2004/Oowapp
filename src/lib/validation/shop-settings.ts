import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/business-types";
import { CURRENCIES } from "@/lib/currencies";

export const businessInfoSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is too short").max(100),
  businessType: z.enum(BUSINESS_TYPES),
  logoUrl: z.string().nullable().optional(),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  whatsappNumber: z
    .string()
    .trim()
    .min(8, "Enter a valid WhatsApp number with country code")
    .max(20)
    .regex(/^[0-9+]+$/, "Digits only, include country code"),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  gstNumber: z.string().trim().max(20).optional().or(z.literal("")),
  currency: z.enum(CURRENCIES),
});
export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;

export const paymentSettingsSchema = z.object({
  upiId: z.string().trim().max(100).optional().or(z.literal("")),
  acceptCash: z.boolean(),
  bankAccountName: z.string().trim().max(100).optional().or(z.literal("")),
  bankAccountNumber: z.string().trim().max(30).optional().or(z.literal("")),
  bankIfsc: z.string().trim().max(15).optional().or(z.literal("")),
  bankName: z.string().trim().max(100).optional().or(z.literal("")),
  paymentQrImageUrl: z.string().nullable().optional(),
});
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

export const orderSettingsSchema = z.object({
  requireCustomerName: z.boolean(),
  requirePhone: z.boolean(),
  requireTableNumber: z.boolean(),
  requireDeliveryAddress: z.boolean(),
  allowNotes: z.boolean(),
  saveOrdersToDb: z.boolean(),
  isPublished: z.boolean(),
});
export type OrderSettingsInput = z.infer<typeof orderSettingsSchema>;
