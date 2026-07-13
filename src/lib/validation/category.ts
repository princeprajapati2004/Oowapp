import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name is too long"),
  isVisible: z.boolean().default(true),
  sortOrder: z.coerce.number().int().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
