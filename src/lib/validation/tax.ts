import { z } from "zod";

export const taxSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    type: z.enum(["PERCENTAGE", "FIXED"]).default("PERCENTAGE"),
    value: z.coerce.number().nonnegative("Value must be 0 or more"),
    appliesTo: z.enum(["ENTIRE_BILL", "CATEGORY"]).default("ENTIRE_BILL"),
    categoryId: z.string().nullable().optional(),
    isEnabled: z.boolean().default(true),
  })
  .refine((data) => data.appliesTo !== "CATEGORY" || !!data.categoryId, {
    message: "Select a category for a category-specific tax",
    path: ["categoryId"],
  });

export type TaxInput = z.infer<typeof taxSchema>;
