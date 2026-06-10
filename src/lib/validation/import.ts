import { z } from "zod";
import { PROJECT_TYPES } from "@/lib/validation/deal";

// Shared validation layer for CSV import rows (FR-3.4). The UI maps CSV
// columns onto these field names before anything reaches the server.

const optionalTrimmed = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const optionalEmail = z
  .string()
  .trim()
  .email()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const CONTACT_IMPORT_FIELDS = [
  "name",
  "email",
  "phone",
  "title",
  "companyName",
] as const;

export const contactImportRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: optionalEmail,
  phone: optionalTrimmed,
  title: optionalTrimmed,
  companyName: optionalTrimmed,
});

export type ContactImportRow = z.infer<typeof contactImportRowSchema>;

export const contactImportRowsSchema = z
  .array(contactImportRowSchema)
  .min(1)
  .max(2000);

export const DEAL_IMPORT_FIELDS = [
  "title",
  "companyName",
  "contactName",
  "contactEmail",
  "contactPhone",
  "estimatedValueDollars",
  "stageName",
  "ownerEmail",
  "projectType",
  "venue",
  "scopeSummary",
  "fixedDate",
] as const;

export const dealImportRowSchema = z
  .object({
    title: optionalTrimmed,
    companyName: optionalTrimmed,
    contactName: optionalTrimmed,
    contactEmail: optionalEmail,
    contactPhone: optionalTrimmed,
    estimatedValueDollars: z.coerce
      .number()
      .positive()
      .max(100_000_000)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    stageName: optionalTrimmed,
    ownerEmail: optionalEmail,
    projectType: z
      .enum(PROJECT_TYPES)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    venue: optionalTrimmed,
    scopeSummary: optionalTrimmed,
    fixedDate: z.coerce
      .date()
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .refine((row) => row.title ?? row.companyName, {
    message: "Each deal row needs a title or a company",
    path: ["title"],
  });

export type DealImportRow = z.infer<typeof dealImportRowSchema>;

export const dealImportRowsSchema = z
  .array(dealImportRowSchema)
  .min(1)
  .max(2000);
