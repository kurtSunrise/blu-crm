import { z } from "zod";

// Knowledge base admin (Assistant v3 Phase 4): one validation layer for the
// /settings/knowledge server actions and any future AI tool that writes the
// corpus (PRD §10: AI tools and actions never fork write paths).

export const KNOWLEDGE_TITLE_MAX = 120;
export const KNOWLEDGE_CATEGORY_MAX = 60;
// Generous ceiling: the largest shipped knowledge doc is a few thousand
// characters; this bounds pathological pastes without cramping real docs.
export const KNOWLEDGE_CONTENT_MAX = 30_000;

export const saveKnowledgeDocSchema = z.object({
  // Absent on create; the slug is derived from the title then. Present on
  // update; the slug never changes after creation.
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX),
  // Optional grouping label; an empty string means "no category".
  category: z.string().trim().max(KNOWLEDGE_CATEGORY_MAX).optional(),
  // Raw markdown BODY only: no frontmatter, title and category are fields.
  content: z.string().trim().min(1).max(KNOWLEDGE_CONTENT_MAX),
});

export const deleteKnowledgeDocSchema = z.object({
  id: z.uuid(),
});
