import { z } from "zod";
import { PROJECT_TYPES } from "@/lib/validation/deal";

// Shared validation layer: the public enquiry endpoint and email intake both
// pass through here, mirroring the human forms (PRD §10).

const optionalTrimmed = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const webEnquirySchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(200),
  email: z.string().trim().email("A valid email is required"),
  phone: optionalTrimmed,
  company: optionalTrimmed,
  projectType: z
    .enum(PROJECT_TYPES)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z
    .string()
    .trim()
    .min(1, "Tell us a little about the project")
    .max(5000),
  budgetDollars: z.coerce.number().positive().max(100_000_000).optional(),
  fixedDate: z.coerce.date().optional(),
  // Honeypot: real visitors never fill this hidden field (FR-3.2 AC).
  website: z.string().max(200).optional(),
});

export type WebEnquiryInput = z.infer<typeof webEnquirySchema>;

export const emailIntakeSchema = z.object({
  from: z.string().trim().email(),
  fromName: optionalTrimmed,
  subject: z.string().trim().min(1).max(500),
  body: z.string().max(50_000).optional(),
});

export type EmailIntakeInput = z.infer<typeof emailIntakeSchema>;
