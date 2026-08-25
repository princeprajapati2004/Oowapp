import { z } from "zod";

export const createReviewSchema = z.object({
  orderId: z.string(),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(500).optional().or(z.literal("")),
});
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
