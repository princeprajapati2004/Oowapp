import { z } from "zod";
import { CURRENCIES } from "@/lib/currencies";

export const verifyAdminPhoneOtpSchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/, "Enter the 6-digit code"),
});

// Owner-profile fields collected during onboarding, on top of what
// signupSchema already collected (businessName/businessType/email/whatsappNumber).
// These map onto pre-existing (previously unused) Shop columns — see the
// "Owner profile" section of the Shop model — plus the two genuinely new
// ones (pincode, timezone).
export const onboardingProfileSchema = z.object({
  ownerName: z.string().trim().min(2, "Owner name is too short").max(100),
  address: z.string().trim().min(5, "Enter a valid business address").max(300),
  city: z.string().trim().min(2, "City is required").max(100),
  state: z.string().trim().min(2, "State is required").max(100),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode"),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  gstNumber: z.string().trim().max(20).optional().or(z.literal("")),
  currency: z.enum(CURRENCIES).optional(),
  timezone: z.string().trim().max(50).optional().or(z.literal("")),
});
export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;
