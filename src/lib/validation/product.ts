import { z } from "zod";

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  price: z.coerce.number().positive("Price must be greater than 0"),
  categoryId: z.string().min(1, "Select a category"),
  imageUrl: z.string().nullable().optional(),
  unit: z.string().trim().max(30).optional().or(z.literal("")),
  foodType: z.enum(["VEG", "NON_VEG", "NA"]).default("NA"),
  isAvailable: z.boolean().default(true),
  isVisible: z.boolean().default(true),
  stock: z.coerce.number().int().nonnegative().nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export type ProductInput = z.infer<typeof productSchema>;
