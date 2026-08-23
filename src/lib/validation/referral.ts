import { z } from "zod";

export const referralConfigSchema = z.object({
  isEnabled: z.boolean().default(false),
  rewardAmount: z.coerce.number().positive("Reward amount must be greater than 0"),
  minQualifyingOrderAmount: z.coerce.number().nonnegative().nullable().optional(),
  qualifyingOrderScope: z.enum(["FIRST_ORDER", "ANY_ORDER"]).default("FIRST_ORDER"),
});
export type ReferralConfigInput = z.infer<typeof referralConfigSchema>;
