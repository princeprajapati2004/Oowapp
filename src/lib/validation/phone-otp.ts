import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .min(8, "Enter a valid phone number")
  .max(20)
  .regex(/^[0-9+]+$/, "Digits only, include country code (e.g. 91XXXXXXXXXX)");

export const sendOtpSchema = z.object({
  shopSlug: z.string(),
  phone: phoneSchema,
});
export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  shopSlug: z.string(),
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
