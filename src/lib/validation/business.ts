import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/business-types";

// Adding a second (or further) business under an existing Admin account.
// Unlike registration step 2 (businessDetailsSchema in auth.ts), there's no
// "step 1" phone collection to fall back on here, so whatsappNumber is
// collected explicitly — a second business's WhatsApp number must not
// silently default to the owner's first shop.
export const addBusinessSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is too short").max(100),
  businessType: z.enum(BUSINESS_TYPES),
  whatsappNumber: z
    .string()
    .trim()
    .min(8, "Enter a valid WhatsApp number with country code")
    .max(20)
    .regex(/^[0-9+]+$/, "Digits only, include country code"),
});
export type AddBusinessInput = z.infer<typeof addBusinessSchema>;

export const switchBusinessSchema = z.object({
  shopId: z.string().min(1),
});
export type SwitchBusinessInput = z.infer<typeof switchBusinessSchema>;
