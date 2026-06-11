import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const createContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: optionalTrimmed,
  title: optionalTrimmed,
  companyName: optionalTrimmed,
  // Set when the user has seen the duplicate warning and chosen to proceed
  // deliberately (FR-2.3).
  allowDuplicate: z.coerce.boolean().default(false),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

const MAX_NOTES_LENGTH = 2000;

const optionalNotes = z
  .string()
  .trim()
  .max(MAX_NOTES_LENGTH)
  .transform((value) => (value === "" ? undefined : value))
  .optional();

// Editing reuses the create fields (duplicates were already resolved at
// create time) and adds the free-text notes (FR-2.2).
export const updateContactSchema = createContactSchema
  .omit({ allowDuplicate: true })
  .extend({ notes: optionalNotes });

export type UpdateContactInput = z.infer<typeof updateContactSchema>;
