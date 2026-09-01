import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/order-status";

const paymentMethodValues = PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]];

export const purchaseItemSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  purchasePrice: z.coerce.number().nonnegative("Purchase price cannot be negative"),
  taxAmount: z.coerce.number().nonnegative().optional(),
  // Item Master — batch receiving detail, only meaningful when this shop's
  // ItemSettings.batchNumberEnabled is on (see PurchaseItem's doc comment).
  batchNumber: z.string().trim().max(60).optional().or(z.literal("")),
  expiryDate: z.string().trim().min(1).optional().or(z.literal("")), // ISO date string
});

export const purchaseSchema = z.object({
  supplierId: z.string().trim().min(1, "Supplier is required"),
  invoiceNumber: z.string().trim().max(100).optional().or(z.literal("")),
  purchaseDate: z.string().min(1, "Date is required"), // ISO date string
  items: z.array(purchaseItemSchema).min(1, "Add at least one item"),
  discountAmount: z.coerce.number().nonnegative().optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
  paymentMethod: z.enum(paymentMethodValues).optional(),
  // Defaults true — overwrite Product.costPrice with this batch's price so
  // future profit calculations use the latest cost. Off lets the owner keep
  // an intentionally different cost basis for this one purchase.
  updateCostPrice: z.boolean().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  clientRequestId: z.string().trim().max(100).optional(),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const recordPurchasePaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]).default("CASH"),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type RecordPurchasePaymentInput = z.infer<typeof recordPurchasePaymentSchema>;

export const cancelPurchaseSchema = z.object({
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});
