import { z } from "zod";

export const createCheckoutOrderSchema = z.object({
  planId: z.string().trim().min(1),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  couponCode: z.string().trim().min(1).optional(),
});

export type CreateCheckoutOrderInput = z.infer<typeof createCheckoutOrderSchema>;

export const verifyCheckoutSchema = z.object({
  transactionId: z.string().trim().min(1),
  gatewayOrderId: z.string().trim().min(1),
  gatewayPaymentId: z.string().trim().min(1),
  gatewaySignature: z.string().trim().min(1),
});

export type VerifyCheckoutInput = z.infer<typeof verifyCheckoutSchema>;

export const scheduleDowngradeSchema = z.object({
  planId: z.string().trim().min(1),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
});

export type ScheduleDowngradeInput = z.infer<typeof scheduleDowngradeSchema>;
