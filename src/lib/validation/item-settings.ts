import { z } from "zod";

export const itemSettingsSchema = z.object({
  descriptionEnabled: z.boolean(),
  mrpEnabled: z.boolean(),
  purchasePriceEnabled: z.boolean(),
  wholesalePriceEnabled: z.boolean(),
  partyPricingEnabled: z.boolean(),
  serialNumberEnabled: z.boolean(),
  batchNumberEnabled: z.boolean(),
  barcodeEnabled: z.boolean(),
  productTypeEnabled: z.boolean(),
  stockEnabled: z.boolean(),
  productImageEnabled: z.boolean(),
  productCodeEnabled: z.boolean(),
  offerEnabled: z.boolean(),
  categoryRequired: z.boolean(),
  hsnEnabled: z.boolean(),
  hsnRequired: z.boolean(),
  allowNegativeStock: z.boolean(),
});

export type ItemSettingsInput = z.infer<typeof itemSettingsSchema>;
