# Work Log: Documents as semantic objects (Office text extraction + hybrid index)

**Agent**: Claude Opus 4.8 (1M context)
**Session ID**: N/A
**Mode**: Plan then implement (crm-ui / data-layer / AI)
**Date**: 2026-07-08T00:00:00Z

## Task Description

Make Word/Excel/PowerPoint deal attachments AI-readable, framed as "how Palantir
Ontology would handle it": treat each uploaded document as a first-class semantic
object whose content is materialized (extracted text), summarized (a cached
description property), indexed into a queryable semantic layer (the same hybrid
pgvector + FTS retrieval the knowledge base uses), and exposed only through typed
AI tools, with provenance back to the source file and deal. PDF was already
readable (native vision); the gap was Office OOXML.

## Actions Taken

- Added `fflate` (pure-JS, workerd-safe unzip).
- `src/lib/ai/office-extract.ts` (new): `extractOfficeText` unzips only the text
  parts of .docx/.xlsx/.pptx and strips XML to plain text; `splitTextChunks`
  size-windows extracted prose (the knowledge chunker only splits on `## `).
  Legacy OLE .doc/.xls/.ppt and corrupt archives return null.
- Schema: new `attachment_chunk` table (mirrors `knowledge_chunk`; 1024-dim
  bge-m3 embedding, HNSW cosine index, `attachmentId` FK `onDelete: cascade` so
  the existing attachment DELETE route cleans chunks with no extra statement,
  denormalized `dealId` for deal-scoped search + provenance).
- `src/lib/ai/documents.ts` (new): `indexAttachmentText` (embed + replace chunks)
  and `searchDealDocuments` (RRF hybrid search, optional deal filter), copied
  from the `knowledge.ts` SQL shape; reuses `embedTextsViaBinding`/`embedQuery`.
- `src/lib/ai/attachment-describe.ts`: added `describeText` (text-only summary,
  no image tokens) and `enrichAttachmentsByIds` (Office -> extract + index +
  summarize; image/PDF -> vision describe + index the description). Idempotent on
  `aiDescribedAt`. Replaces `describeAttachmentsByIds`.
- `src/lib/ai/attachments.ts`: `loadDealAttachmentBytes` (R2 raw bytes for Office
  extraction).
- `view_deal_file` (`file-tools.ts`): reads Office docs as extracted text and
  lazily enriches; image/PDF path unchanged. New `search_deal_documents` tool
  (`document-tools.ts`) wired into `ALL_TOOLS` with citations + source chips.
- System prompt: documents are readable; introduced `search_deal_documents`.
- Upload route: eager mode now calls `enrichAttachmentsByIds` (describe + index).
- e2e: multi-file+pptx test coverage; gave post-upload render assertions a 20s
  timeout (they wait on a server `router.refresh` re-render).

## Decisions Made

- **Text as a semantic property, not raw bytes to the model.** Office text is
  extracted, summarized into `aiDescription` (get_deal recall), and chunk-embedded
  for search. The model reasons over the materialized layer via typed tools, not
  opaque blobs, and never re-bills the file each turn.
- **Enrich on ingest/access, not a Node backfill.** The plan proposed a
  `getPlatformProxy` backfill script, but that proxy exposes a *local* R2, not
  prod R2, so it cannot read prod objects; and Office support is not yet deployed
  to prod, so there are no existing files to backfill. Replaced with eager
  (on-upload) + lazy (first `view_deal_file`) enrichment, which is more
  Ontology-correct (materialize on ingest/access). Dropped `scripts/
  backfill-attachment-index.ts` and the `db:index-attachments` script from the
  plan.
- **Index tied to enrichment**: search returns results for a file once it has
  been enriched (eager: right after upload; lazy: after first view). The tool
  distinguishes "nothing indexed yet" from "no match".
- Kept the embed-before-write ordering (no transactions on Neon HTTP).

## Issues Encountered

- e2e flake: uploads succeed ("2 files added" toast) but the grid renders after an
  un-awaited `router.refresh`; the default 5s assertion loses to remote-DB
  re-render latency plus the heavier `/api/attachments` first-hit dev compile
  (fflate + new modules). Gave the post-refresh assertions a 20s timeout. Product
  path is unchanged; this is a `next dev` artifact (built worker has no per-request
  compile). All 9 attachment tests pass serially (`--workers=1`, tablet-WebKit
  flake).

## Verification

- Extraction unit check (scratchpad tsx): .docx/.xlsx/.pptx text, legacy-null,
  corrupt-null, and chunker all PASS.
- `npm run check` (ultracite) clean across 368 files; `npm run build` succeeds.
- `npm run test:e2e -- attachments --workers=1` — 9/9 pass (phone, tablet,
  desktop).
- Not run: `npm run ai:eval` (optional; changes are additive). Real-model
  comprehension of documents is best confirmed manually in dev.

## Prod Rollout

1. `npm run db:push:prod` (creates `attachment_chunk` + HNSW; pgvector already
   enabled) BEFORE `npm run deploy`, since deployed code reads the table.
2. `npm run deploy`.
3. No backfill step. Existing Office files enrich on first upload (eager) or first
   view (lazy).

## Next Steps

- Manual dev check: upload a real .pptx/.docx, ask the assistant to read it and
  run `search_deal_documents`.
- Optional future: full xlsx grid reconstruction (currently text/labels only);
  make chat-attachment uploads accept Office too (still `AI_READABLE_TYPES`-gated).

## Related Files

- New: `src/lib/ai/office-extract.ts`, `src/lib/ai/documents.ts`,
  `src/lib/ai/tools/document-tools.ts`
- Modified: `src/db/schema.ts`, `src/lib/ai/attachment-describe.ts`,
  `src/lib/ai/attachments.ts`, `src/lib/ai/tools/file-tools.ts`,
  `src/lib/ai/tools/index.ts`, `src/lib/ai/system-prompt.ts`,
  `src/app/api/attachments/route.ts`, `e2e/attachments.spec.ts`, `package.json`
