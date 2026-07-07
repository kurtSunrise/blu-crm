import { z } from "zod";

// Assistant memory (Assistant v3 Phase 3): one shared validation layer for
// the save_memory tool, the server actions behind the Undo chip, and the
// Settings review UI (PRD §10: AI tools and actions never fork write paths).

export const MEMORY_CONTENT_MAX = 500;
export const MEMORY_CONTENT_MIN = 8;

// Trimmed so a padded 500-char paste still fits and a whitespace-only save
// fails the minimum. Bounds keep injected memory blocks token-cheap.
export const memoryContentSchema = z
  .string()
  .trim()
  .min(MEMORY_CONTENT_MIN)
  .max(MEMORY_CONTENT_MAX);

export const saveMemoryToolSchema = z.object({
  content: memoryContentSchema.describe(
    "The fact or preference to remember, one fact per call, phrased in third person, max 500 characters"
  ),
});

export const disableMemorySchema = z.object({
  memoryId: z.uuid(),
});

export const updateMemorySchema = z.object({
  content: memoryContentSchema,
  memoryId: z.uuid(),
});

export const createOrgMemorySchema = z.object({
  content: memoryContentSchema,
});
