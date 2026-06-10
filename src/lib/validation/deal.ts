import { z } from "zod";

// Shared validation layer: human forms and (later) AI tools both pass
// through these schemas (PRD §10 architecture note).

const optionalTrimmed = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const PROJECT_TYPES = [
  "fit_out",
  "retail_display",
  "event_stand",
  "exhibition",
  "install",
  "themed_build",
  "other",
] as const;

export const quickAddDealSchema = z
  .object({
    companyName: z.string().trim().min(1, "Client / brand is required"),
    contactName: optionalTrimmed,
    contactEmail: z
      .string()
      .trim()
      .email()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    contactPhone: optionalTrimmed,
    projectType: z.enum(PROJECT_TYPES).optional(),
    scopeSummary: optionalTrimmed,
    estimatedValueDollars: z.coerce
      .number()
      .positive()
      .max(100_000_000)
      .optional(),
    fixedDate: z.coerce.date().optional(),
    ownerId: optionalTrimmed,
  })
  .refine((value) => value.contactEmail ?? value.contactPhone, {
    message: "At least one contact method (email or phone) is required",
    path: ["contactEmail"],
  });

export type QuickAddDealInput = z.infer<typeof quickAddDealSchema>;

export const LOST_REASON_OPTIONS = [
  { value: "price", label: "Price" },
  { value: "timing", label: "Timing" },
  { value: "went_elsewhere", label: "Went elsewhere" },
  { value: "no_response", label: "No response" },
  { value: "parked", label: "Parked" },
] as const;

const LOST_REASONS = [
  "price",
  "timing",
  "went_elsewhere",
  "no_response",
  "parked",
] as const;

export const moveDealStageSchema = z.object({
  dealId: z.string().min(1),
  stageId: z.string().min(1),
  lostReason: z.enum(LOST_REASONS).optional(),
});

export type MoveDealStageInput = z.infer<typeof moveDealStageSchema>;

export const QUICK_LOG_TYPES = [
  "call",
  "email",
  "site_visit",
  "meeting",
  "note",
] as const;

export const logActivitySchema = z.object({
  dealId: z.string().min(1),
  type: z.enum(QUICK_LOG_TYPES),
  content: optionalTrimmed,
});

export type LogActivityInput = z.infer<typeof logActivitySchema>;
