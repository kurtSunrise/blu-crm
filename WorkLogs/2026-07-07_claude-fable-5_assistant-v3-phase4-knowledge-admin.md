# Work Log: Assistant v3 Phase 4, Knowledge Admin Vertical

**Agent**: Claude Fable 5 (claude-fable-5), data-layer agent
**Session ID**: N/A
**Mode**: Feature build (server + UI)
**Date**: 2026-07-07T00:00:00Z

## Task Description
Let admins manage the assistant knowledge corpus at /settings/knowledge instead of the CLI-only `npm run knowledge:import`: create, edit, and delete knowledge docs with chunking and best-effort Workers AI embedding on save.

## Actions Taken
- Extracted the frontmatter parse and "## " heading chunk-splitting from `src/db/knowledge-import.ts` into pure functions in `src/lib/ai/knowledge-chunks.ts` (`parseKnowledgeFrontmatter`, `parseKnowledgeDoc`, `splitKnowledgeChunks`, `chunkEmbeddingText`). The CLI importer now imports them; a parity script confirmed byte-identical parse and chunk output on all three `knowledge/*.md` docs.
- Added `embedTextsViaBinding(texts): Promise<(number[] | null)[]>` to `src/lib/ai/embeddings.ts`: batches of `EMBEDDING_BATCH_LIMIT` through the Workers AI binding (same acquisition as `embedQuery`), 10s overall budget, null entries on any failure so saves never hang and unembedded chunks fall back to full-text search.
- New validation layer `src/lib/validation/knowledge.ts` (title 120, category 60, content 30,000 chars; id is a UUID) shared by the actions and any future AI tool.
- New write cores `src/lib/mutations/knowledge.ts` (`saveKnowledgeDocCore`, `deleteKnowledgeDocCore`) and actions `src/lib/actions/knowledge-actions.ts` (`saveKnowledgeDocAction`, `deleteKnowledgeDocAction`), both `requireActionAdmin` + `runAction`, revalidating /settings/knowledge.
- New admin page `src/app/(app)/settings/knowledge/page.tsx` (doc list with updated date, sections/embedded counts via a grouped count query, Promise.all fan-out, LIMIT 100) and client editor `src/components/knowledge-doc-editor.tsx` (inline create/edit with category datalist, character count, two-step delete, 44px targets).
- Added the "Knowledge" tab to `src/components/settings-nav.tsx` (admin gate lives in the page, matching Deal statuses / Company / Team).

## Decisions Made
- Slugs derive from the title on create (kebab, unique-suffixed) and are immutable on update, because the CLI importer upserts by slug and re-keying would fork a doc.
- Write order per the no-transactions rule: upsert doc row (atomic, holds full content), delete chunks, embed, insert chunks with embeddings in one batched insert. A crash between delete and insert leaves a doc showing "0 sections"; re-saving rebuilds them. Delete removes chunks before the doc row.
- `updatedAt` bumps on every save, feeding the Phase 1 source-chip freshness hint.
- Embedding is best-effort by design (nulls on failure); a stopped batch aborts the remaining batches to save the budget.

## Issues Encountered
- `npm run build` compiles but fails typecheck in `src/components/ai/ai-runtime-provider.tsx` (missing `voiceAttachmentIds` in a `RequestContext` literal). That file is another agent's in-flight Phase 4 work and out of scope here; `npx tsc --noEmit` shows it is the only file with errors, so this vertical typechecks clean.
- Scripts outside the Worker have no AI binding, so the sanity run stored null embeddings (expected fallback path, logged as `[knowledge] embed-fallback`).

## Verification
- `npm exec -- ultracite check`: clean (354 files).
- Sanity script against the dev DB: create (3 chunks, correct headings and positions), slug uniqueness (`-2` suffix), `searchKnowledge` finds the new doc via FTS, edit rebuilds 4 chunks with slug unchanged and `updatedAt` advanced, delete removes chunks then doc, double delete returns not-found, DB left clean.
- Chunker parity: old vs new output identical on the full corpus.

## Next Steps
- E2E coverage for /settings/knowledge (a later pass owns it).
- The other agent's `ai-runtime-provider.tsx` type error must be fixed before the next deploy.

## Related Files
- src/lib/ai/knowledge-chunks.ts (new)
- src/lib/ai/embeddings.ts
- src/db/knowledge-import.ts
- src/lib/validation/knowledge.ts (new)
- src/lib/mutations/knowledge.ts (new)
- src/lib/actions/knowledge-actions.ts (new)
- src/app/(app)/settings/knowledge/page.tsx (new)
- src/components/knowledge-doc-editor.tsx (new)
- src/components/settings-nav.tsx
