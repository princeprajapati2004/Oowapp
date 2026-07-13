import { z } from "zod";

interface CheckoutSchemaOptions {
  requireCustomerName: boolean;
  requirePhone: boolean;
  requireTableNumber: boolean;
  requireDeliveryAddress: boolean;
}

const optionalText = z.string().trim().optional().or(z.literal(""));

export function buildCheckoutSchema(opts: CheckoutSchemaOptions) {
  return z.object({
    customerName: opts.requireCustomerName
      ? z.string().trim().min(1, "Name is required")
      : optionalText,
    customerPhone: opts.requirePhone
      ? z.string().trim().min(6, "Enter a valid phone number")
      : optionalText,
    tableNumber: opts.requireTableNumber
      ? z.string().trim().min(1, "Table number is required")
      : optionalText,
    deliveryAddress: opts.requireDeliveryAddress
      ? z.string().trim().min(1, "Delivery address is required")
      : optionalText,
    notes: optionalText,
  });
}

export type CheckoutInput = z.infer<ReturnType<typeof buildCheckoutSchema>>;
