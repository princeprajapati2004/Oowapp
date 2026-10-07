import { z } from "zod";

export const subscriptionCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Code is too short")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens, and underscores only")
    .transform((v) => v.toUpperCase()),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).default("PERCENTAGE"),
  discountValue: z.coerce.number().positive(),
  maxDiscountAmount: z.coerce.number().min(0).optional().nullable(),
  minAmount: z.coerce.number().min(0).optional().nullable(),
  applicablePlanCodes: z.array(z.string().trim().toUpperCase()).default([]),
  startsAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  totalUsageLimit: z.coerce.number().int().positive().optional().nullable(),
  perAdminLimit: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type SubscriptionCouponInput = z.infer<typeof subscriptionCouponSchema>;

export const subscriptionCouponUpdateSchema = subscriptionCouponSchema.partial();

export type SubscriptionCouponUpdateInput = z.infer<typeof subscriptionCouponUpdateSchema>;

export const validateCouponSchema = z.object({
  code: z.string().trim().min(1),
  planId: z.string().trim().min(1),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
});

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
