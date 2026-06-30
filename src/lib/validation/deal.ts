import { z } from "zod";

// Shared validation layer: human forms and (later) AI tools both pass
// through these schemas (PRD §10 architecture note).

const optionalTrimmed = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

// Free-text activity/note body. The DB column (`activity.content`) is unbounded
// `text`; this cap is just a sanity bound, well above a long email-style update
// (the short `optionalTrimmed` 2000 cap silently rejected real notes — FR fix).
const longOptionalText = z
  .string()
  .trim()
  .max(20_000)
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

export const LOST_REASONS = [
  "price",
  "timing",
  "went_elsewhere",
  "no_response",
  "parked",
] as const;

export const moveDealStageSchema = z.object({
  dealId: z.string().min(1),
  stageId: z.string().min(1),
  // Required by the action when the target stage is Lost / Dormant (FR-1.6)
  lostReason: z.enum(LOST_REASONS).optional(),
  // Only meaningful when the target stage is Won (FR-1.6)
  handoverToDelivery: z.boolean().optional(),
});

export type MoveDealStageInput = z.infer<typeof moveDealStageSchema>;

// A null subStatusId clears the label; the note is optional context either way.
// Statuses are admin-configurable rows now, so the id is validated against the
// deal_sub_status table in the action rather than a fixed enum here.
export const setDealSubStatusSchema = z.object({
  dealId: z.string().min(1),
  subStatusId: z.string().min(1).nullable(),
  note: optionalTrimmed,
});

export type SetDealSubStatusInput = z.infer<typeof setDealSubStatusSchema>;

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
  content: longOptionalText,
});

export type LogActivityInput = z.infer<typeof logActivitySchema>;

// A valid http(s) link, or an empty string which clears the field.
export const updateSharedFolderSchema = z.object({
  dealId: z.string().min(1),
  sharedFolderUrl: z
    .string()
    .trim()
    .max(2000)
    .url("Enter a valid link (including https://)")
    .or(z.literal("")),
});

export type UpdateSharedFolderInput = z.infer<typeof updateSharedFolderSchema>;
