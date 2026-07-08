import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachment, attachmentChunk } from "@/db/schema";
import { embedQuery, embedTextsViaBinding } from "@/lib/ai/embeddings";
import { splitTextChunks } from "@/lib/ai/office-extract";
import { toIsoOrNull } from "@/lib/format";

// The queryable semantic layer over deal-attachment content. Extracted document
// text is chunked, embedded, and stored in attachment_chunk (indexAttachmentText),
// then retrieved by the same hybrid RRF search the knowledge corpus uses
// (searchDealDocuments). This is what lets the assistant reason over the content
// of a deal's uploaded documents, with provenance back to the source file.

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const CANDIDATE_LIMIT = 20;
const RRF_K = 60;

export interface DealDocumentPassage {
  attachmentId: string;
  content: string;
  // The source file's upload time as an ISO string; feeds the source chip.
  createdAt: string | null;
  fileName: string;
}

export interface IndexResult {
  chunkCount: number;
  embeddedCount: number;
}

// Replace an attachment's chunk rows with freshly embedded ones. Idempotent: a
// re-run (backfill, re-view) rebuilds the index cleanly. Ordered for
// prefix-recoverability on the transaction-less Neon HTTP driver (embed first,
// best-effort, never throws), then the delete + single-statement insert; a
// crash between them leaves the attachment with zero chunks, which the next
// enrichment run rebuilds from the source bytes.
export const indexAttachmentText = async (params: {
  attachmentId: string;
  dealId: string;
  text: string;
}): Promise<IndexResult> => {
  const chunks = splitTextChunks(params.text);
  const embeddings = await embedTextsViaBinding(chunks);

  await db
    .delete(attachmentChunk)
    .where(eq(attachmentChunk.attachmentId, params.attachmentId));

  if (chunks.length > 0) {
    await db.insert(attachmentChunk).values(
      chunks.map((content, index) => ({
        attachmentId: params.attachmentId,
        content,
        dealId: params.dealId,
        embedding: embeddings[index] ?? null,
        position: index,
      }))
    );
  }

  return {
    chunkCount: chunks.length,
    embeddedCount: embeddings.filter((vector) => vector !== null).length,
  };
};

// Whether a deal (or the whole corpus) has any indexed document chunks, so the
// tool can tell the model "no documents indexed" apart from "no match".
export const hasIndexedDocuments = async (
  dealId?: string
): Promise<boolean> => {
  const [row] = await db
    .select({ id: attachmentChunk.id })
    .from(attachmentChunk)
    .where(dealId ? eq(attachmentChunk.dealId, dealId) : undefined)
    .limit(1);
  return row !== undefined;
};

const chunkDocument = sql`to_tsvector('english', ${attachmentChunk.content})`;
const tsQueryFor = (query: string) => sql`plainto_tsquery('english', ${query})`;

const rowsToPassages = (
  rows: {
    attachment_id: string;
    content: string;
    created_at: unknown;
    file_name: string;
  }[]
): DealDocumentPassage[] =>
  rows.map((row) => ({
    attachmentId: row.attachment_id,
    content: row.content,
    createdAt: toIsoOrNull(row.created_at),
    fileName: row.file_name,
  }));

const searchDealDocumentsFts = async (
  query: string,
  limit: number,
  dealId?: string
): Promise<DealDocumentPassage[]> => {
  const tsQuery = tsQueryFor(query);
  const dealFilter = dealId
    ? sql`and ${attachmentChunk.dealId} = ${dealId}`
    : sql``;
  const result = await db.execute(sql`
    select c.content as content, c.attachment_id as attachment_id,
      a.file_name as file_name, a.created_at as created_at
    from ${attachmentChunk} c
    join ${attachment} a on a.id = c.attachment_id
    where ${chunkDocument} @@ ${tsQuery} ${dealFilter}
    order by ts_rank(${chunkDocument}, ${tsQuery}) desc
    limit ${Math.min(limit, MAX_LIMIT)}
  `);
  return rowsToPassages(result.rows as Parameters<typeof rowsToPassages>[0]);
};

// One statement fuses full-text and vector retrieval (reciprocal rank fusion),
// optionally scoped to one deal. Same shape as searchKnowledgeHybrid.
const searchDealDocumentsHybrid = async (
  query: string,
  embedding: number[],
  limit: number,
  dealId?: string
): Promise<DealDocumentPassage[]> => {
  const tsQuery = tsQueryFor(query);
  const queryVector = sql`${JSON.stringify(embedding)}::vector`;
  const candidateLimit = sql.raw(String(CANDIDATE_LIMIT));
  const rrfK = sql.raw(String(RRF_K));
  const dealFilter = dealId
    ? sql`and ${attachmentChunk.dealId} = ${dealId}`
    : sql``;

  const result = await db.execute(sql`
    with fts as (
      select ${attachmentChunk.id} as id,
        row_number() over (
          order by ts_rank(${chunkDocument}, ${tsQuery}) desc
        ) as r
      from ${attachmentChunk}
      where ${chunkDocument} @@ ${tsQuery} ${dealFilter}
      order by r
      limit ${candidateLimit}
    ),
    vec as (
      select ${attachmentChunk.id} as id,
        row_number() over (
          order by ${attachmentChunk.embedding} <=> ${queryVector}
        ) as r
      from ${attachmentChunk}
      where ${attachmentChunk.embedding} is not null ${dealFilter}
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
    select c.content as content, c.attachment_id as attachment_id,
      a.file_name as file_name, a.created_at as created_at
    from fused
    join ${attachmentChunk} c on c.id = fused.id
    join ${attachment} a on a.id = c.attachment_id
    order by fused.score desc
    limit ${Math.min(limit, MAX_LIMIT)}
  `);
  return rowsToPassages(result.rows as Parameters<typeof rowsToPassages>[0]);
};

export const searchDealDocuments = async (
  query: string,
  options?: { dealId?: string; limit?: number }
): Promise<DealDocumentPassage[]> => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const embedding = await embedQuery(trimmed);
  if (!embedding) {
    return await searchDealDocumentsFts(trimmed, limit, options?.dealId);
  }
  const passages = await searchDealDocumentsHybrid(
    trimmed,
    embedding,
    limit,
    options?.dealId
  );
  console.log("[documents] hybrid", { passages: passages.length });
  return passages;
};
