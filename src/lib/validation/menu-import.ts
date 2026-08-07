import { z } from "zod";

export const menuImportItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().trim().max(500).nullable(),
  price: z.coerce.number().nonnegative().nullable(),
  category: z.string().trim().min(1, "Category is required").max(60, "Category name is too long"),
  foodType: z.enum(["VEG", "NON_VEG", "EGG", "NA"]),
  gstNote: z.string().trim().max(60).nullable(),
  confidence: z.enum(["high", "low"]),
  existingProductId: z.string().nullable().optional(),
  resolution: z.enum(["skip", "update", "keep_both"]).optional(),
  imageUrl: z.string().nullable().optional(),
});

export const menuImportCommitSchema = z.object({
  sourceType: z.enum(["EXCEL", "CSV"]),
  fileName: z.string().trim().max(200).nullable().optional(),
  items: z.array(menuImportItemSchema).min(1, "No items to import"),
});

export type MenuImportCommitInput = z.infer<typeof menuImportCommitSchema>;
