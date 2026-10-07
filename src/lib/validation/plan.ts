import { z } from "zod";

export const planSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores only"),
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().default(true),
  isArchived: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
  monthlyPrice: z.coerce.number().min(0).optional().nullable(),
  annualPrice: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().trim().length(3).default("INR"),
  isPopular: z.boolean().default(false),
  trialDays: z.coerce.number().int().min(0).default(15),
});

export type PlanInput = z.infer<typeof planSchema>;

export const planUpdateSchema = planSchema.partial();

export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export const featureSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Key is required")
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only"),
  label: z.string().trim().min(1, "Label is required").max(80),
  description: z.string().trim().max(300).optional().nullable(),
  category: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type FeatureInput = z.infer<typeof featureSchema>;

export const planFeaturesSchema = z.object({
  features: z.array(
    z.object({
      featureId: z.string().trim().min(1),
      enabled: z.boolean(),
    })
  ),
});

export type PlanFeaturesInput = z.infer<typeof planFeaturesSchema>;

const LIMIT_KEYS = ["BUSINESSES", "USERS", "PRODUCTS", "GODOWNS", "STORAGE_MB", "MONTHLY_ORDERS", "CUSTOMERS", "INVOICES"] as const;

export const planLimitsSchema = z.object({
  limits: z.array(
    z.object({
      limitKey: z.enum(LIMIT_KEYS),
      // null = unlimited.
      limitValue: z.coerce.number().int().min(0).nullable(),
    })
  ),
});

export type PlanLimitsInput = z.infer<typeof planLimitsSchema>;
