import { z } from "zod";

export const walletAdjustmentSchema = z.object({
  // Positive to credit, negative to debit — see adjustWalletManually.
  amount: z.number().refine((v) => v !== 0, "Amount can't be zero"),
  description: z.string().trim().max(200).optional(),
});

export type WalletAdjustmentInput = z.infer<typeof walletAdjustmentSchema>;
