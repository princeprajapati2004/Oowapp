import { z } from "zod";

export const cashbackCampaignSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Code must be at least 2 characters")
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, hyphens and underscores only"),
    description: z.string().trim().max(200).optional().or(z.literal("")),
    rewardType: z.enum(["PERCENTAGE", "FIXED"]).default("PERCENTAGE"),
    rewardValue: z.coerce.number().positive("Reward value must be greater than 0"),
    maxCashbackAmount: z.coerce.number().positive().nullable().optional(),
    minOrderAmount: z.coerce.number().nonnegative().nullable().optional(),
    totalUsageLimit: z.coerce.number().int().positive().nullable().optional(),
    perCustomerLimit: z.coerce.number().int().positive().nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    isEnabled: z.boolean().default(true),
  })
  .refine((data) => data.rewardType !== "PERCENTAGE" || data.rewardValue <= 100, {
    message: "A percentage reward can't exceed 100%",
    path: ["rewardValue"],
  })
  .refine((data) => !data.startsAt || !data.expiresAt || data.startsAt < data.expiresAt, {
    message: "Start date must be before the expiry date",
    path: ["expiresAt"],
  });

export type CashbackCampaignInput = z.infer<typeof cashbackCampaignSchema>;

export const validateCashbackSchema = z.object({
  shopSlug: z.string(),
  code: z.string().trim().min(1, "Enter a cashback code"),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});
export type ValidateCashbackInput = z.infer<typeof validateCashbackSchema>;
