import { z } from "zod";

const productObjectSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    price: z.coerce.number().positive("Price must be greater than 0"),
    // Owner-only cost/pricing fields — optional and nullable so existing
    // products with neither set keep working (see Product model's doc
    // comment). Selling Price (price, above) exceeding MRP is allowed and
    // only surfaced as a UI warning, never blocked here.
    costPrice: z.coerce.number().nonnegative("Purchase price can't be negative").nullable().optional(),
    mrp: z.coerce.number().nonnegative("MRP can't be negative").nullable().optional(),
    // Item Master — B2B/bulk price, independent of price/mrp/costPrice.
    wholesalePrice: z.coerce.number().nonnegative("Wholesale price can't be negative").nullable().optional(),
    categoryId: z.string().min(1, "Select a category"),
    imageUrl: z.string().nullable().optional(),
    unit: z.string().trim().max(30).optional().or(z.literal("")),
    barcode: z.string().trim().max(64).optional().or(z.literal("")),
    // Item Master — GST HSN/SAC code. Free text (no registry lookup), same
    // convention as `unit`. Required-ness depends on this shop's
    // ItemSettings.hsnRequired, checked in the service layer (not
    // expressible statically here since it needs an async settings lookup).
    hsnCode: z.string().trim().max(20).optional().or(z.literal("")),
    // Item Master — owner-defined unique code, checked for uniqueness async
    // in the service layer (same pattern as barcode).
    productCode: z.string().trim().max(40).optional().or(z.literal("")),
    productType: z.string().trim().max(40).optional().or(z.literal("")),
    serialNumber: z.string().trim().max(60).optional().or(z.literal("")),
    batchNumber: z.string().trim().max(60).optional().or(z.literal("")),
    openingStock: z.coerce.number().int().nonnegative().nullable().optional(),
    // Item Master — structured offer, computed on top of `price` at
    // cart/order time (see pricing.ts), never stored as the new base price.
    offerType: z.enum(["PERCENTAGE", "FLAT"]).nullable().optional(),
    offerValue: z.coerce.number().nonnegative("Offer value can't be negative").nullable().optional(),
    foodType: z.enum(["VEG", "NON_VEG", "EGG", "NA"]).default("NA"),
    isCombo: z.boolean().default(false),
    offerNote: z.string().trim().max(60).optional().or(z.literal("")),
    isAvailable: z.boolean().default(true),
    isVisible: z.boolean().default(true),
    stock: z.coerce.number().int().nonnegative().nullable().optional(),
    sortOrder: z.coerce.number().int().default(0),
  });

function checkOfferFields(data: { offerType?: "PERCENTAGE" | "FLAT" | null; offerValue?: number | null }, ctx: z.RefinementCtx) {
  if (data.offerType === "PERCENTAGE" && data.offerValue != null && data.offerValue > 100) {
    ctx.addIssue({ code: "custom", path: ["offerValue"], message: "Percentage offer can't exceed 100%" });
  }
  if (data.offerType && (data.offerValue == null || data.offerValue <= 0)) {
    ctx.addIssue({ code: "custom", path: ["offerValue"], message: "Enter an offer value" });
  }
}

export const productSchema = productObjectSchema.superRefine(checkOfferFields);
export type ProductInput = z.infer<typeof productSchema>;

// Real partial-update schema for PATCH — every field optional, no defaults
// applied, so a caller can send just `{ isAvailable: false }` (e.g. the
// products list's inline availability toggle) without needing to resend the
// entire product. Built from productObjectSchema (pre-refine) so `.partial()`
// works directly — see updateProduct in services/product.ts, which only
// touches the keys actually present in the parsed object.
export const productPatchSchema = productObjectSchema.partial().superRefine(checkOfferFields);
export type ProductPatchInput = z.infer<typeof productPatchSchema>;
