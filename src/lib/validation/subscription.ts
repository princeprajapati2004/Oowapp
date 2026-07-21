import { z } from "zod";

const DURATION_VALUES = [
  "FIFTEEN_DAYS",
  "ONE_MONTH",
  "THREE_MONTHS",
  "SIX_MONTHS",
  "TWELVE_MONTHS",
  "CUSTOM",
] as const;

const durationFields = {
  duration: z.enum(DURATION_VALUES),
  endDate: z.coerce.date().optional(),
};

const remarksField = { remarks: z.string().trim().max(500).optional() };

export const subscriptionActionSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("create"),
      planCode: z.string().trim().min(1, "Plan is required"),
      ...durationFields,
      ...remarksField,
    }),
    z.object({
      action: z.literal("renew"),
      ...durationFields,
      ...remarksField,
    }),
    z.object({
      action: z.literal("extend"),
      ...durationFields,
      ...remarksField,
    }),
    z.object({
      action: z.literal("change_plan"),
      planCode: z.string().trim().min(1, "Plan is required"),
      ...remarksField,
    }),
    z.object({ action: z.literal("suspend"), ...remarksField }),
    z.object({ action: z.literal("resume"), ...remarksField }),
    z.object({ action: z.literal("expire"), ...remarksField }),
  ])
  .superRefine((data, ctx) => {
    if ("duration" in data && data.duration === "CUSTOM" && !data.endDate) {
      ctx.addIssue({
        code: "custom",
        message: "A custom duration requires an explicit end date",
        path: ["endDate"],
      });
    }
  });

export type SubscriptionActionInput = z.infer<typeof subscriptionActionSchema>;

export const featurePermissionSchema = z.object({
  featureId: z.string().trim().min(1),
  enabled: z.boolean(),
  reason: z.string().trim().max(300).optional().nullable(),
});

export type FeaturePermissionInput = z.infer<typeof featurePermissionSchema>;
