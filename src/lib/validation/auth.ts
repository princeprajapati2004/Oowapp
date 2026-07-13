import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/business-types";

export const signupSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is too short").max(100),
  businessType: z.enum(BUSINESS_TYPES),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  whatsappNumber: z
    .string()
    .trim()
    .min(8, "Enter a valid WhatsApp number with country code")
    .max(20)
    .regex(/^[0-9+]+$/, "Digits only, include country code (e.g. 91XXXXXXXXXX)"),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
