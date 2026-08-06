import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salary",
  "Electricity",
  "Gas",
  "Raw Materials",
  "Vegetables",
  "Milk",
  "Maintenance",
  "Marketing",
  "Miscellaneous",
] as const;

export const EXPENSE_PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK"] as const;

export const expenseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().trim().min(1, "Category is required").max(100),
  amount: z.number().positive("Amount must be positive").max(10_000_000),
  date: z.string().min(1, "Date is required"), // ISO date string
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
