import { z } from "zod";

export const createFollowUpSchema = z.object({
  dealId: z.string().min(1),
  action: z.string().trim().min(1, "Next action is required").max(500),
  ownerId: z.string().min(1, "Owner is required"),
  dueDate: z.coerce.date(),
});

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const completeFollowUpSchema = z.object({
  followUpId: z.string().min(1),
});

export type CompleteFollowUpInput = z.infer<typeof completeFollowUpSchema>;
