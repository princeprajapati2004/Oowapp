import { z } from "zod";

export const partySchema = z.object({
  type: z.enum(["CUSTOMER", "SUPPLIER"]).default("CUSTOMER"),
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  phone: z.string().trim().min(1, "Phone is required").max(20, "Phone is too long"),
  // "" -> null is load-bearing, not cosmetic: @@unique([shopId, gstNumber])
  // treats "" as a real value, so two no-GST parties would otherwise collide.
  gstNumber: z
    .string()
    .trim()
    .max(20)
    .transform((v) => (v ? v.toUpperCase() : null))
    .nullable()
    .optional(),
  businessName: z.string().trim().max(150).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  category: z.enum(["VIP", "WHOLESALE", "RETAIL", "GENERAL"]).default("GENERAL"),
  openingBalance: z.coerce.number().default(0),
  creditLimit: z.coerce.number().nonnegative().nullable().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type PartyInput = z.infer<typeof partySchema>;

export const partyPaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]).default("CASH"),
  direction: z.enum(["RECEIVED", "PAID"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type PartyPaymentInput = z.infer<typeof partyPaymentSchema>;
