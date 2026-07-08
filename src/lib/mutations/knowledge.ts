import { eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeChunk, knowledgeDoc } from "@/db/schema";
import { embedTextsViaBinding } from "@/lib/ai/embeddings";
import {
  chunkEmbeddingText,
  splitKnowledgeChunks,
} from "@/lib/ai/knowledge-chunks";

// Write cores for the knowledge corpus, shared by the /settings/knowledge
// server actions and any future AI tool that manages the corpus (PRD §10:
// one write path). Callers gate auth and validate input first.

export interface SaveKnowledgeDocInput {
  category: string | null;
  content: string;
  id?: string;
  title: string;
}

export interface SaveKnowledgeDocResult {
  chunkCount?: number;
  docId?: string;
  embeddedCount?: number;
  error?: string;
}

const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const SLUG_MAX = 80;

const kebabSlug = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(NON_SLUG_CHARS, "-")
    .replace(EDGE_DASHES, "")
    .slice(0, SLUG_MAX);
  return slug.length > 0 ? slug : "doc";
};

// One query pulls every slug that could collide (the base itself plus any
// suffixed variants), then the first free suffix wins.
const uniqueSlug = async (base: string): Promise<string> => {
  const rows = await db
    .select({ slug: knowledgeDoc.slug })
    .from(knowledgeDoc)
    .where(
      or(eq(knowledgeDoc.slug, base), like(knowledgeDoc.slug, `${base}-%`))
    );
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
};

export const saveKnowledgeDocCore = async (
  input: SaveKnowledgeDocInput
): Promise<SaveKnowledgeDocResult> => {
  const chunks = splitKnowledgeChunks(input.content);
  const now = new Date();

  // No transactions on the Neon HTTP driver, so the statements below are
  // ordered for prefix-recoverability: the doc row (which holds the full
  // content) is written first as a single atomic statement, then its chunks
  // are replaced. A crash between the chunk delete and the chunk insert
  // leaves a doc with zero chunks; the status column on /settings/knowledge
  // shows "0 sections" and re-saving the doc rebuilds them from `content`.
  let docId: string;
  if (input.id) {
    const [existing] = await db
      .select({ id: knowledgeDoc.id })
      .from(knowledgeDoc)
      .where(eq(knowledgeDoc.id, input.id))
      .limit(1);
    if (!existing) {
      return { error: "That document no longer exists." };
    }
    docId = existing.id;
    // The slug is immutable after creation: the CLI importer upserts by slug
    // and re-keying would fork a doc into two rows.
    await db
      .update(knowledgeDoc)
      .set({
        category: input.category,
        content: input.content,
        title: input.title,
        updatedAt: now,
      })
      .where(eq(knowledgeDoc.id, docId));
  } else {
    docId = crypto.randomUUID();
    const slug = await uniqueSlug(kebabSlug(input.title));
    await db.insert(knowledgeDoc).values({
      category: input.category,
      content: input.content,
      id: docId,
      slug,
      title: input.title,
    });
  }

  await db.delete(knowledgeChunk).where(eq(knowledgeChunk.docId, docId));

  // Best-effort embedding: null entries stay unembedded and full-text search
  // covers them; a later re-save retries.
  const embeddings = await embedTextsViaBinding(chunks.map(chunkEmbeddingText));

  if (chunks.length > 0) {
    await db.insert(knowledgeChunk).values(
      chunks.map((chunk, index) => ({
        content: chunk.content,
        docId,
        embedding: embeddings[index] ?? null,
        heading: chunk.heading,
        position: chunk.position,
      }))
    );
  }

  return {
    chunkCount: chunks.length,
    docId,
    embeddedCount: embeddings.filter((vector) => vector !== null).length,
  };
};

export const deleteKnowledgeDocCore = async (
  id: string
): Promise<{ error?: string }> => {
  const [existing] = await db
    .select({ id: knowledgeDoc.id })
    .from(knowledgeDoc)
    .where(eq(knowledgeDoc.id, id))
    .limit(1);
  if (!existing) {
    return { error: "That document no longer exists." };
  }

  // Chunks first: a crash after this statement leaves a doc with zero chunks
  // (visible in the status column, still deletable), never orphaned chunks.
  await db.delete(knowledgeChunk).where(eq(knowledgeChunk.docId, id));
  await db.delete(knowledgeDoc).where(eq(knowledgeDoc.id, id));
  return {};
};
