import { z } from "zod";

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Code must be at least 2 characters")
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, hyphens and underscores only"),
    description: z.string().trim().max(200).optional().or(z.literal("")),
    discountType: z.enum(["PERCENTAGE", "FIXED"]).default("PERCENTAGE"),
    discountValue: z.coerce.number().positive("Discount value must be greater than 0"),
    maxDiscountAmount: z.coerce.number().positive().nullable().optional(),
    minOrderAmount: z.coerce.number().nonnegative().nullable().optional(),
    totalUsageLimit: z.coerce.number().int().positive().nullable().optional(),
    perCustomerLimit: z.coerce.number().int().positive().nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    isEnabled: z.boolean().default(true),
    categoryIds: z.array(z.string()).default([]),
    productIds: z.array(z.string()).default([]),
  })
  .refine((data) => data.discountType !== "PERCENTAGE" || data.discountValue <= 100, {
    message: "A percentage discount can't exceed 100%",
    path: ["discountValue"],
  })
  .refine((data) => !data.startsAt || !data.expiresAt || data.startsAt < data.expiresAt, {
    message: "Start date must be before the expiry date",
    path: ["expiresAt"],
  });

export type CouponInput = z.infer<typeof couponSchema>;

export const validateCouponSchema = z.object({
  shopSlug: z.string(),
  code: z.string().trim().min(1, "Enter a coupon code"),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
