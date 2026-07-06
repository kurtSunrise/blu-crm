import { sql } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeChunk, knowledgeDoc } from "@/db/schema";
import { embedQuery } from "@/lib/ai/embeddings";

// Hybrid retrieval over the knowledge corpus: Postgres full-text search fused
// with pgvector cosine similarity over @cf/baai/bge-m3 embeddings (reciprocal
// rank fusion). Embedding the query is best-effort: when the Workers AI
// binding is unavailable (next dev, scripts) or slow, embedQuery returns null
// and retrieval degrades to the original full-text path.

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

// Candidates each retriever contributes before fusion. The corpus is small,
// so 20 per side comfortably covers every plausible answer chunk.
const CANDIDATE_LIMIT = 20;

// Standard reciprocal-rank-fusion constant: score = sum(1 / (60 + rank)).
const RRF_K = 60;

export interface KnowledgePassage {
  content: string;
  docTitle: string;
  heading: string | null;
}

const tsQueryFor = (query: string) => sql`plainto_tsquery('english', ${query})`;
const chunkDocument = sql`to_tsvector('english', coalesce(${knowledgeChunk.heading}, '') || ' ' || ${knowledgeChunk.content})`;

// The original lexical path, kept behaviourally identical: chunks ranked by
// ts_rank against a plainto_tsquery.
const searchKnowledgeFts = async (
  query: string,
  limit: number
): Promise<KnowledgePassage[]> => {
  const tsQuery = tsQueryFor(query);
  const rows = await db
    .select({
      content: knowledgeChunk.content,
      docTitle: knowledgeDoc.title,
      heading: knowledgeChunk.heading,
    })
    .from(knowledgeChunk)
    .innerJoin(knowledgeDoc, sql`${knowledgeChunk.docId} = ${knowledgeDoc.id}`)
    .where(sql`${chunkDocument} @@ ${tsQuery}`)
    .orderBy(sql`ts_rank(${chunkDocument}, ${tsQuery}) desc`)
    .limit(Math.min(limit, MAX_LIMIT));

  return rows;
};

// One statement fuses both retrievers, so the Neon HTTP driver pays a single
// round-trip and there is no partial-write concern. A stopword-only query
// leaves the fts CTE empty and an unembedded corpus leaves the vec CTE empty;
// the full outer join lets either side carry the result alone.
const searchKnowledgeHybrid = async (
  query: string,
  embedding: number[],
  limit: number
): Promise<KnowledgePassage[]> => {
  const tsQuery = tsQueryFor(query);
  const queryVector = sql`${JSON.stringify(embedding)}::vector`;
  const candidateLimit = sql.raw(String(CANDIDATE_LIMIT));
  const rrfK = sql.raw(String(RRF_K));

  const result = await db.execute(sql`
    with fts as (
      select ${knowledgeChunk.id} as id,
        row_number() over (
          order by ts_rank(${chunkDocument}, ${tsQuery}) desc
        ) as r
      from ${knowledgeChunk}
      where ${chunkDocument} @@ ${tsQuery}
      order by r
      limit ${candidateLimit}
    ),
    vec as (
      select ${knowledgeChunk.id} as id,
        row_number() over (
          order by ${knowledgeChunk.embedding} <=> ${queryVector}
        ) as r
      from ${knowledgeChunk}
      where ${knowledgeChunk.embedding} is not null
      order by r
      limit ${candidateLimit}
    ),
    fused as (
      select coalesce(fts.id, vec.id) as id,
        coalesce(1.0 / (${rrfK} + fts.r), 0)
          + coalesce(1.0 / (${rrfK} + vec.r), 0) as score
      from fts
      full outer join vec on vec.id = fts.id
    )
    select c.content as content, d.title as doc_title, c.heading as heading
    from fused
    join ${knowledgeChunk} c on c.id = fused.id
    join ${knowledgeDoc} d on d.id = c.doc_id
    order by fused.score desc
    limit ${Math.min(limit, MAX_LIMIT)}
  `);

  const rows = result.rows as {
    content: string;
    doc_title: string;
    heading: string | null;
  }[];

  return rows.map((row) => ({
    content: row.content,
    docTitle: row.doc_title,
    heading: row.heading,
  }));
};

export const searchKnowledge = async (
  query: string,
  limit = DEFAULT_LIMIT
): Promise<KnowledgePassage[]> => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const embedding = await embedQuery(trimmed);
  if (!embedding) {
    return await searchKnowledgeFts(trimmed, limit);
  }

  const passages = await searchKnowledgeHybrid(trimmed, embedding, limit);
  // Post-deploy observability: confirms the vector path is live in prod.
  console.log("[knowledge] hybrid", { passages: passages.length });
  return passages;
};
