import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salary",
  "Staff Expense",
  "Electricity",
  "Water",
  "Gas",
  "Raw Materials",
  "Vegetables",
  "Milk",
  "Packaging",
  "Transportation",
  "Delivery",
  "Equipment",
  "Maintenance",
  "Repairs",
  "Cleaning",
  "Marketing",
  "Advertising",
  "Internet",
  "Phone",
  "Software",
  "Office Expense",
  "Bank Charges",
  "Government Fees",
  "Tax",
  "Miscellaneous",
  "Other",
] as const;

// Kept additive to the original four (CASH/UPI/CARD/BANK) so existing
// expense records always keep matching a known Select option — see
// PAYMENT_METHOD_LABELS in expenses-manager.tsx for display labels.
export const EXPENSE_PAYMENT_METHODS = [
  "CASH",
  "UPI",
  "GPAY",
  "PHONEPE",
  "BANK_TRANSFER",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "CARD",
  "BANK",
  "CHEQUE",
  "OTHER",
] as const;

export const expenseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().trim().min(1, "Category is required").max(100),
  amount: z.number().positive("Amount must be positive").max(10_000_000),
  date: z.string().min(1, "Date is required"), // ISO date string
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  // For UPI/online/cheque payments — never forced for cash.
  transactionReference: z.string().trim().max(100).optional().or(z.literal("")),
  // Optional link to an existing Party (vendor/supplier).
  partyId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
