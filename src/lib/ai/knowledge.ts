import { sql } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeChunk, knowledgeDoc } from "@/db/schema";

// Lexical retrieval over the knowledge corpus using Postgres full-text search.
// Chunks are ranked by ts_rank against a plainto_tsquery so the assistant gets
// the few most relevant passages. The corpus is small, so this needs no vector
// store; semantic search (embeddings/pgvector) is a future upgrade.

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

export interface KnowledgePassage {
  content: string;
  docTitle: string;
  heading: string | null;
}

export const searchKnowledge = async (
  query: string,
  limit = DEFAULT_LIMIT
): Promise<KnowledgePassage[]> => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const tsQuery = sql`plainto_tsquery('english', ${trimmed})`;
  const document = sql`to_tsvector('english', coalesce(${knowledgeChunk.heading}, '') || ' ' || ${knowledgeChunk.content})`;

  const rows = await db
    .select({
      content: knowledgeChunk.content,
      docTitle: knowledgeDoc.title,
      heading: knowledgeChunk.heading,
    })
    .from(knowledgeChunk)
    .innerJoin(knowledgeDoc, sql`${knowledgeChunk.docId} = ${knowledgeDoc.id}`)
    .where(sql`${document} @@ ${tsQuery}`)
    .orderBy(sql`ts_rank(${document}, ${tsQuery}) desc`)
    .limit(Math.min(limit, MAX_LIMIT));

  return rows;
};
