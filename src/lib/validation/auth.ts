import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/business-types";

// Registration step 1 — phone + email only. Business owner auth is OTP-only,
// so there is no password field anywhere in this flow.
export const registerStartSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid phone number with country code")
    .max(20)
    .regex(/^[0-9+]+$/, "Digits only, include country code (e.g. 91XXXXXXXXXX)"),
  email: z.string().trim().email("Enter a valid email"),
});
export type RegisterStartInput = z.infer<typeof registerStartSchema>;

// Registration step 2 — collected after email OTP verification, once the
// admin has a pending-registration token (see auth.ts). Creates the Shop.
export const businessDetailsSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is too short").max(100),
  businessType: z.enum(BUSINESS_TYPES),
});
export type BusinessDetailsInput = z.infer<typeof businessDetailsSchema>;

export const sendLoginOtpSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});
export type SendLoginOtpInput = z.infer<typeof sendLoginOtpSchema>;

export const verifyLoginOtpSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  otp: z.string().length(6).regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type VerifyLoginOtpInput = z.infer<typeof verifyLoginOtpSchema>;
