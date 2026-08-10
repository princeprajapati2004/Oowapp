import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .min(8, "Enter a valid phone number")
  .max(20)
  .regex(/^[0-9+]+$/, "Digits only, include country code (e.g. 91XXXXXXXXXX)");

export const customerSignupSchema = z.object({
  shopSlug: z.string(),
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: phoneSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;

export const customerLoginSchema = z.object({
  shopSlug: z.string(),
  phone: phoneSchema,
  password: z.string().min(1, "Password is required"),
});
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
