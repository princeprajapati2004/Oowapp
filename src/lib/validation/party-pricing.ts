import { z } from "zod";

export const partyPriceSchema = z.object({
  partyId: z.string().min(1, "Select a party"),
  price: z.coerce.number().nonnegative("Price can't be negative"),
});

export type PartyPriceInput = z.infer<typeof partyPriceSchema>;
