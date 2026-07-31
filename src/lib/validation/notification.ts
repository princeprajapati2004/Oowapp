import { z } from "zod";

export const notificationBulkActionSchema = z.object({
  action: z.literal("read_all"),
});

export type NotificationBulkActionInput = z.infer<typeof notificationBulkActionSchema>;
