# Work Log: AI assistant best-in-class upgrade

**Agent**: Claude Fable 5 (claude-fable-5)
**Session ID**: 6849f98d-c93a-4635-a9c0-8dc391c749a2
**Mode**: Interactive (plan approved by Kurt)
**Date**: 2026-07-07T00:11:22Z

## Task Description

Full-slate upgrade of the M4 assistant to best-in-class, per the approved plan (`~/.claude/plans/as-a-superior-model-parallel-neumann.md`): live tool activity chips, visible reasoning, retry/regenerate, context-aware welcome plus deterministic follow-up suggestions, knowledge citations, artifact and confirmation persistence across thread resume, thread rename/pin/soft-delete, new entry points (Ask Blu AI prefill buttons, Cmd/Ctrl+J, mobile More-menu item), voice input via Workers AI Whisper, semantic knowledge search (pgvector + bge-m3 hybrid RRF), multi-step write plans, stream-protocol cleanup, and a production deploy. Continues the 2026-07-03 `ai-assistant-ui-redesign` work and closes several M4 deferrals. Feature work is committed as c8f34e5 (48 files) and live on prod.

## Actions Taken

- **Phase 0 groundwork**: stream-protocol payload additions (`reasoning`, `sources`, `suggestions`, `tool_start.label`, `tool_done.isError`; `confirmation_request` gains `items[]` with the legacy single-item fields mirrored from `items[0]` for the one-deploy compat window). Additive schema: `knowledge_chunk.embedding vector(1024)` + HNSW index, new `chat_artifact` table, `ai_audit_log.message_id`, `chat_thread.pinned_at`, `ai_audit_status` value `skipped`. New `scripts/enable-pgvector.ts` (must run before drizzle push). `wrangler.jsonc` gains the single `AI` binding (Whisper + embeddings); regenerated `cloudflare-env.d.ts`.
- **Implementation** ran as three parallel workstreams on disjoint files (server core, client core, platform), then an integrator review pass over the merged tree (fixes listed under Issues).
- **Reasoning**: requests `thinking: { type: "adaptive", display: "summarized" }`; plain `adaptive` streams empty thinking deltas on current models, so `display` is required.
- **Regenerate**: rolls the thread back to the last plain user turn and reruns. The server refuses with 409 when the doomed span contains executed or failed writes, honouring the double-write concern recorded in the 2026-07-03 log.
- **Multi-step write plans**: all write blocks in a turn queue as one `PendingPlan` v2, reviewed as a single checklist card (per-item approve/skip/edit), executed sequentially server-side with stop-on-first-failure and per-item audit.
- **e2e**: new mock scenarios (reasoning, two-write plan, knowledge search) plus full spec coverage including new `e2e/ai-plan.spec.ts`. Suites green: desktop 30 passed, phone 31 passed, tablet 29 passed with 2 designed skips (run with `--workers=1`). `playwright.config.ts` now sets `CHAT_DAILY_MESSAGE_LIMIT=1000000` and `ENQUIRY_RATE_LIMIT=1000` for suite stability.
- **Evals**: `npm run ai:eval` finished 12/12 (100%) after fixing pre-existing fixture rot and grader assumptions (detail under Issues; initial run was 8/12).
- **Prod rollout, all completed in order**: `df -h /` disk check; `npm run db:pgvector:prod` (pgvector 0.8.1); `npm run db:push:prod` with all five additive changes verified via `information_schema`; `npm run knowledge:import:prod` (null embeddings, Cloudflare REST creds absent); wrote NEW `scripts/backfill-knowledge-embeddings.ts` which embeds via the wrangler `getPlatformProxy` AI binding (no `CLOUDFLARE_API_TOKEN` needed, the wrangler OAuth session carries it) and embedded 10/10 prod chunks (dev too); added `db:embed-knowledge` (+ `:prod`) to package.json; commit c8f34e5; deploy via the font-fetch recipe from the 2026-07-06 pipeline log (`NODE_OPTIONS="--no-network-family-autoselection"` scoped to the opennextjs BUILD phase only, then a plain deploy). Live version `b303a62a-6d66-41d9-8dfe-de30c6b1e018`.
- **Live verification (real prod, browser)**: Cmd+J opens the dock; a knowledge question rendered the "Searching the knowledge base" activity chip, five source chips, and a follow-up suggestion chip; a two-lead multi-write plan rendered the "Review 2 proposed changes" checklist and Confirm 2 executed both (BLU-2026-947/948); `data_changed` live-refreshed the dashboard (13 to 15 deals); cleanup via a second two-item discard plan returned the dashboard to 13, leaving prod data clean; hard reload plus thread resume re-rendered the confirmation checklist card inert with per-item Approved statuses (the deferred M4 resume item, now closed); `wrangler tail` captured `[knowledge] hybrid`, proving the runtime embedding + fused query path is live.

## Decisions Made

- **`chat_artifact` table over custom blocks in `chat_message.content`**: keeps model replay byte-pure and the 40-row replay window lean; regenerate's message deletion cleans artifacts via FK cascade.
- **Queued plan over auto-continue for multi-write**: one checklist card, sequential server-side execution, stop-on-first-failure, per-item audit. Sequential awaits here are a deliberate, documented exception to the fan-out rule because the writes are order-dependent.
- **Grouped confirmation card**: a message's confirmation parts render as ONE checklist card with per-item statuses. The integrator review found that per-item cards on resume were dangerous: the server treats missing decisions as skips, so confirming one card would silently skip the rest of the plan.
- **Deterministic follow-up suggestions** (server-side rule table keyed on tools used and artifact types): no extra model call, prompt-cache safe.
- **Single Workers AI binding** serves both Whisper transcription and bge-m3 embeddings; no new vendors, no new runtime npm dependencies (3 MiB Worker bundle constraint).
- **Embedding backfill via `getPlatformProxy`** instead of requiring a `CLOUDFLARE_API_TOKEN` in `.env.production`: the local wrangler OAuth session already authorises the AI binding, so no new secret was minted.
- **Eval graders accept a grounding read as a valid first step**: Sonnet 5 grounds before drafting (`get_contact`, `search_knowledge_base`), which is exactly what the system prompt mandates; graders still fail writes in the first response and still enforce kind plus the no-em-dash rule whenever `present_draft` comes first. Two decisiveness lines were added to the system prompt (draft in the first response when details suffice; propose changes rather than describing them).
- **Regenerate 409 on executed/failed writes** rather than allowing rollback across them: prevents re-running writes and preserves the audit trail.
- The long-open "verify NDJSON on workerd via preview" item was closed via live prod verification instead of preview, because preview sign-in is broken locally (see Issues).

## Issues Encountered

- **Integrator review caught four merge-seam defects** before commit: (1) the resumed multi-write plan splitting into per-item cards (fixed by grouping into one checklist card, rationale above); (2) a stale-card status fallback wrongly showing "Approved" for superseded plans; (3) a literal NUL byte used as a dedupe separator in `knowledge-tools.ts`, which made git treat the file as binary; (4) a regenerate 409 whose clearer server message the client swallowed.
- **Eval regression was pre-existing, not caused by this work**: the initial 8/12 (67%) was reproduced identically against the UNMODIFIED baseline prompt, so the failures predate this task (likely drift since the 2026-07-02 switch to claude-sonnet-5, when evals were not rerun). Root causes: the lead-capture-complete fixture had a hardcoded install date 20/06/2026 now in the past, so the model correctly queried the apparent typo instead of capturing (date moved to 20/06/2031 with a comment); and draft fixtures graded only the FIRST response of an agentic loop (grader fix above). Final: 12/12.
- **First deploy attempt silently did not upload**: `wrangler deployments list` still showed the 2026-07-03 version afterwards. The re-run succeeded (version b303a62a). Always verify the deployed version id, not just a clean exit.
- **Preview sign-in broken locally**: `npm run preview` sign-in POST returns 500 with an empty body on local workerd. Pre-existing (this task did not touch the auth stack); pages render fine and prod sign-in works.
- **Observability gap**: streamed POST `/api/chat` events appear absent from the Workers Observability query API (which also behaved oddly with timeframes); `wrangler tail` works and was used for the `[knowledge] hybrid` verification.
- **e2e environment findings**: Base UI focus guards fail the axe `aria-command-name` rule on WebKit with a popup open (excluded with a comment; library-internal); the Next dev-tools badge overlaps the composer attach button on phone in dev only (hidden in a test helper); a stale hung next-server on port 3000 makes Playwright reuse it and hang the run.

## Next Steps

- Watch `[knowledge] embed-fallback` frequency in prod logs; the embed timeout is 2s with a hard FTS fallback.
- Add a dated help-page What's New entry (`WHATS_NEW` in `src/app/(app)/help/page.tsx`) now that the upgrade is deployed.
- Accepted/known gaps: reasoning text and source chips do not reappear on thread resume; PRD FR-7.7's "original audio attached" clause remains open (shipped dictation discards audio after transcription); Z.AI remains a settings-badge-only stub (docs now say so); the regenerate button still shows on a closing turn after an executed write, but the server refuses safely with a clear message that the client now surfaces.
- Remove the temporary `[auth-debug]` instrumentation once the upstream workerd bug is resolved (unchanged from prior logs).

## Related Files

- Commit c8f34e5 holds the full change set (48 files); see the plan's files summary for the complete list.
- New: src/lib/ai/artifact-store.ts, src/lib/ai/embeddings.ts, src/lib/ai/suggestions.ts
- New: src/components/ai/voice-input-button.tsx, src/components/ai/ask-ai-button.tsx, src/components/ai/welcome-suggestions.ts, src/components/ai/artifacts/source-chips.tsx
- New: src/app/api/chat/transcribe/route.ts
- New: scripts/enable-pgvector.ts, scripts/backfill-knowledge-embeddings.ts
- New: e2e/ai-plan.spec.ts
- Plan: ~/.claude/plans/as-a-superior-model-parallel-neumann.md
- Prior logs: WorkLogs/2026-07-03_claude-sonnet-5_ai-assistant-ui-redesign.md (double-write concern honoured by the regenerate 409), WorkLogs/2026-07-06_claude-fable-5_pipeline-mobile-header-compaction.md (deploy font-fetch recipe)
