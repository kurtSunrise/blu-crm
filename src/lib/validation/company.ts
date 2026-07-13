import { z } from "zod";

const MAX_FIELD_LENGTH = 500;
const MAX_NOTES_LENGTH = 2000;

const optionalTrimmed = z
  .string()
  .trim()
  .max(MAX_FIELD_LENGTH)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const optionalNotes = z
  .string()
  .trim()
  .max(MAX_NOTES_LENGTH)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

// Who Blu builds for (PRD FR-2.1). The schema stores kind as free text,
// so these drive the select options while validation stays lenient.
export const COMPANY_KINDS = [
  "brand",
  "agency",
  "venue",
  "shopping centre",
  "referral partner",
] as const;

const ABN_DIGITS = /^\d{11}$/;

// ABN entry is lenient about spacing ("51 824 753 556" is the ABR's own
// display format) but stores the 11 bare digits.
const optionalAbn = z
  .string()
  .trim()
  .transform((value) => value.replaceAll(" ", ""))
  .refine((value) => value === "" || ABN_DIGITS.test(value), {
    message: "An ABN is 11 digits",
  })
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const updateCompanySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: optionalTrimmed,
  abn: optionalAbn,
  legalName: optionalTrimmed,
  website: optionalTrimmed,
  notes: optionalNotes,
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
